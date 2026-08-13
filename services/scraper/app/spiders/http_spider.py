"""
HTTP Spider — httpx-based web crawler with sitemap + embedded-resource
discovery (see app.discovery).

Used for normal pages that do not require JavaScript rendering.
Playwright is NOT launched here.
"""
import asyncio
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, Set
from urllib.parse import urlparse

import httpx
import structlog

from app.discovery.extractor import (
    extract_page_links,
    extract_resource_urls,
    extract_sitemap_locs,
)
from app.discovery.robots import RobotsCache
from app.normalize.url_normalizer import normalize_url

log = structlog.get_logger(__name__)


@dataclass
class CrawlConfig:
    start_urls: list[str]
    allowed_domains: list[str]
    allowed_url_patterns: list[str]
    excluded_url_patterns: list[str]
    allowed_extensions: list[str]
    allowed_mime_types: list[str]
    max_depth: int = 5
    max_pages: int = 10000
    max_files: int = 10000
    request_delay_ms: int = 1000
    concurrency: int = 4
    request_timeout_seconds: int = 30
    max_retries: int = 3
    robots_enabled: bool = True


@dataclass
class DiscoveredFile:
    url: str
    depth: int


@dataclass
class CrawlResult:
    pages_crawled: int = 0
    files_discovered: list[DiscoveredFile] = field(default_factory=list)
    cancelled: bool = False


# Known downloadable file extensions — used as the explicit allowlist when a
# collector configures `allowed_extensions`, and as a hint (not a gate) when
# it doesn't. Deliberately broad: ebooks, subtitles, and data formats are
# exactly the kind of "article/research" attachment a fixed short list used
# to miss entirely.
DOWNLOADABLE_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".rtf",
    ".epub", ".mobi", ".azw3", ".fb2",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
    ".mp3", ".mp4", ".wav", ".ogg", ".opus", ".flac", ".m4a", ".aac",
    ".mkv", ".webm", ".mov", ".avi", ".flv",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".heic",
    ".html", ".htm", ".txt", ".md", ".csv", ".tsv", ".json", ".jsonl", ".xml",
    ".srt", ".vtt", ".parquet",
}

# Extensions that mean "this is another page to crawl", never a standalone
# downloadable file — the boundary used by the discover-everything fallback
# below to decide "URL with an unrecognized extension" from "URL with no
# real extension at all" (e.g. a clean article slug like /articles/my-post).
_PAGE_EXTENSIONS = {
    ".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".cfm", ".shtml", "",
}


def is_downloadable_url(url: str, allowed_extensions: list[str]) -> bool:
    """
    Check if a URL points to a downloadable file.

    With an explicit `allowed_extensions` allowlist configured, only those
    extensions match — that's an intentional narrowing filter. With none
    configured (the default), *any* URL whose path has a real, non-page
    extension is treated as a candidate file, not just the fixed list above
    — per "discover everything by default": a `.epub`, `.parquet`, or a
    format nobody thought to list still gets attempted. The list above is
    then just the first, fast-path check; detect_mime() after download is
    still what actually validates content, so this only widens what gets
    *attempted*, not what gets trusted.
    """
    path = urlparse(url).path.lower()
    if allowed_extensions:
        return any(path.endswith(ext) for ext in allowed_extensions)

    if any(path.endswith(ext) for ext in DOWNLOADABLE_EXTENSIONS):
        return True

    last_segment = path.rsplit("/", 1)[-1]
    ext = "." + last_segment.rsplit(".", 1)[-1] if "." in last_segment else ""
    return ext not in _PAGE_EXTENSIONS


def url_matches_pattern(url: str, patterns: list[str]) -> bool:
    """Return True if the URL matches any of the given regex patterns."""
    return any(re.search(pattern, url) for pattern in patterns)


def is_allowed_domain(url: str, allowed_domains: list[str]) -> bool:
    """Return True if the URL's domain is in the allowed list (or list is empty)."""
    if not allowed_domains:
        return True
    hostname = urlparse(url).hostname or ""
    return any(
        hostname == domain or hostname.endswith(f".{domain}")
        for domain in allowed_domains
    )


_BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",  # GCP metadata service
}


def _is_private_ip(candidate: str) -> bool:
    import ipaddress
    try:
        addr = ipaddress.ip_address(candidate)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_unspecified
    except ValueError:
        return False


async def is_private_address(url: str) -> bool:
    """
    SSRF protection — block private/internal/loopback addresses.

    Resolves hostnames via DNS and checks the *resolved* IP, not just the
    hostname string — a bare string-prefix check (e.g. hostname.startswith
    ("10.")) would both false-positive on public hostnames like
    "10.example.com" and, more importantly, miss DNS rebinding: an attacker-
    controlled domain that resolves to 127.0.0.1 or a cloud metadata IP.

    Async because DNS resolution is a blocking syscall — doing it
    synchronously here would stall the whole crawler event loop, not just
    the current URL, while waiting on a slow or unresponsive resolver.
    """
    import asyncio
    import socket

    hostname = urlparse(url).hostname or ""
    if not hostname:
        return True  # no host at all — treat as unsafe rather than let it through

    if hostname.lower() in _BLOCKED_HOSTNAMES:
        return True

    if _is_private_ip(hostname):
        return True

    try:
        loop = asyncio.get_running_loop()
        # getaddrinfo covers both IPv4 and IPv6 resolution.
        resolved = await loop.getaddrinfo(hostname, None)
    except socket.gaierror:
        # Can't resolve — fail closed. A URL we can't verify is safe is not safe.
        return True

    return any(_is_private_ip(info[4][0]) for info in resolved)


async def crawl(
    config: CrawlConfig,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
) -> CrawlResult:
    """
    Perform an HTTP crawl using httpx.
    Returns all discovered downloadable file URLs.

    Does NOT download the files — that is done by the collection job.
    """
    result = CrawlResult()
    visited: Set[str] = set()
    queue: asyncio.Queue = asyncio.Queue()

    headers = {
        "User-Agent": "ODP-Collector/1.0 (+https://github.com/org/data-platform)",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }

    delay = config.request_delay_ms / 1000.0

    async with httpx.AsyncClient(
        headers=headers,
        timeout=config.request_timeout_seconds,
        follow_redirects=True,
        http2=True,  # connection reuse/multiplexing — real throughput win, no correctness cost
        limits=httpx.Limits(max_connections=config.concurrency),
    ) as client:
        robots = RobotsCache(client)

        async def seed(url: str, depth: int = 0) -> None:
            if url in visited:
                return
            if await is_private_address(url):
                log.warning("ssrf_blocked", url=url)
                return
            if not await robots.is_allowed(url, enabled=config.robots_enabled):
                log.debug("robots_disallowed", url=url)
                return
            visited.add(url)
            await queue.put((url, depth))

        # Seed the queue from configured start URLs, plus whatever their
        # sitemap(s) advertise — sitemaps are often the only place a
        # research/archive site lists every document it hosts, rather than
        # linking each one from a page reachable by crawling.
        for raw_url in config.start_urls:
            start_url = normalize_url(raw_url)
            if start_url is None:
                log.warning("malformed_or_unsupported_url", url=raw_url)
                continue
            await seed(start_url)

            try:
                for sitemap_url in await robots.sitemaps_for(start_url):
                    sitemap_resp = await client.get(
                        sitemap_url, timeout=config.request_timeout_seconds
                    )
                    if sitemap_resp.status_code != 200:
                        continue
                    for loc in extract_sitemap_locs(sitemap_resp.text):
                        loc_url = normalize_url(loc, base_url=sitemap_url)
                        if loc_url is None:
                            continue
                        if not is_allowed_domain(loc_url, config.allowed_domains):
                            continue
                        await seed(loc_url)
            except httpx.HTTPError as exc:
                log.debug("sitemap_fetch_failed", url=start_url, error=str(exc))

        semaphore = asyncio.Semaphore(config.concurrency)

        async def process_url(url: str, depth: int) -> None:
            async with semaphore:
                if result.pages_crawled >= config.max_pages:
                    return
                if len(result.files_discovered) >= config.max_files:
                    return

                await asyncio.sleep(delay)

                try:
                    # Quick check: is this a downloadable file URL?
                    if is_downloadable_url(url, config.allowed_extensions):
                        if not url_matches_pattern(url, config.excluded_url_patterns):
                            result.files_discovered.append(DiscoveredFile(url=url, depth=depth))
                            log.debug("file_discovered", url=url)
                        return

                    if not await robots.is_allowed(url, enabled=config.robots_enabled):
                        log.debug("robots_disallowed", url=url)
                        return

                    # Fetch page
                    response = await client.get(url)
                    result.pages_crawled += 1

                    if response.status_code != 200:
                        return

                    content_type = response.headers.get("content-type", "")
                    if "text/html" not in content_type:
                        # Could be a direct file — treat as discovered
                        if not url_matches_pattern(url, config.excluded_url_patterns):
                            result.files_discovered.append(DiscoveredFile(url=url, depth=depth))
                        return

                    log.debug("page_crawled", url=url, depth=depth)
                    html = response.text

                    # Every non-<a> resource this page points to — images,
                    # video/audio sources, embedded objects, feed enclosures,
                    # and URLs found in inline scripts/JSON-LD. A resource
                    # that IS itself a downloadable file is recorded
                    # regardless of depth (it's terminal, not something to
                    # recurse into); anything else found this way is treated
                    # exactly like a normal <a> link below, subject to the
                    # same max_depth limit.
                    extra_page_candidates: set[str] = set()
                    for resource_url in extract_resource_urls(html, url):
                        normalized = normalize_url(resource_url, base_url=url)
                        if normalized is None or normalized in visited:
                            continue
                        if not is_allowed_domain(normalized, config.allowed_domains):
                            continue
                        if await is_private_address(normalized):
                            continue
                        if url_matches_pattern(normalized, config.excluded_url_patterns):
                            continue

                        if is_downloadable_url(normalized, config.allowed_extensions):
                            visited.add(normalized)
                            result.files_discovered.append(DiscoveredFile(url=normalized, depth=depth))
                            log.debug("file_discovered", url=normalized, via="embedded_resource")
                        else:
                            extra_page_candidates.add(normalized)

                    if depth >= config.max_depth:
                        return

                    # Extract links from HTML — plus any non-file embedded
                    # resources above that look like more pages rather than
                    # downloadable content (normalize_url is idempotent, so
                    # re-normalizing the already-normalized candidates here
                    # is harmless).
                    for link in extract_page_links(html, url) | extra_page_candidates:
                        link_url = normalize_url(link, base_url=url)
                        if link_url is None:
                            continue
                        if link_url in visited:
                            continue
                        if not is_allowed_domain(link_url, config.allowed_domains):
                            continue
                        if await is_private_address(link_url):
                            continue
                        if config.allowed_url_patterns and not url_matches_pattern(
                            link_url, config.allowed_url_patterns
                        ):
                            continue
                        if url_matches_pattern(link_url, config.excluded_url_patterns):
                            continue

                        visited.add(link_url)
                        await queue.put((link_url, depth + 1))

                except httpx.TooManyRedirects:
                    log.warning("too_many_redirects", url=url)
                except httpx.TimeoutException:
                    log.warning("timeout", url=url)
                except Exception as exc:
                    log.error("crawl_error", url=url, error=str(exc))

        tasks = []
        while not queue.empty() or tasks:
            # Crawls can run for a long time (many pages, no domain
            # restriction, etc.) with no other checkpoint — without this,
            # a cancelled run keeps crawling regardless, since the only
            # other cancellation check (in collection_job.py) happens
            # AFTER the whole crawl phase finishes.
            if should_cancel is not None and await should_cancel():
                result.cancelled = True
                break

            while not queue.empty():
                url, depth = await queue.get()
                task = asyncio.create_task(process_url(url, depth))
                tasks.append(task)
                if len(tasks) >= config.concurrency * 2:
                    break

            if tasks:
                done, tasks_set = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                tasks = list(tasks_set)

            if queue.empty() and not tasks:
                break

        if result.cancelled:
            for task in tasks:
                task.cancel()
            log.info("crawl_cancelled", pages=result.pages_crawled)
        else:
            log.info(
                "crawl_complete",
                pages=result.pages_crawled,
                files=len(result.files_discovered),
            )
    return result
