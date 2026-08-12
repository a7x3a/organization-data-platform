"""
HTTP Spider — Scrapy/httpx-based web crawler.

Used for normal pages that do not require JavaScript rendering.
Playwright is NOT launched here.
"""
import asyncio
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, Set
from urllib.parse import urljoin, urlparse

import httpx
import structlog
from scrapy.linkextractors import LinkExtractor
from scrapy.http import HtmlResponse

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


# Common downloadable file extensions
DOWNLOADABLE_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp",
    ".zip", ".tar", ".gz", ".rar", ".7z",
    ".mp3", ".mp4", ".wav", ".ogg", ".opus", ".flac",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".html", ".htm", ".txt", ".csv", ".json", ".xml",
}


def is_downloadable_url(url: str, allowed_extensions: list[str]) -> bool:
    """Check if a URL points to a downloadable file."""
    path = urlparse(url).path.lower()
    extensions = set(allowed_extensions) if allowed_extensions else DOWNLOADABLE_EXTENSIONS
    return any(path.endswith(ext) for ext in extensions)


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

    # Validate and seed the queue
    for raw_url in config.start_urls:
        url = normalize_url(raw_url)
        if url is None:
            log.warning("malformed_or_unsupported_url", url=raw_url)
            continue
        if await is_private_address(url):
            log.warning("ssrf_blocked", url=url)
            continue
        await queue.put((url, 0))
        visited.add(url)

    headers = {
        "User-Agent": "ODP-Collector/1.0 (+https://github.com/org/data-platform)",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }

    delay = config.request_delay_ms / 1000.0

    async with httpx.AsyncClient(
        headers=headers,
        timeout=config.request_timeout_seconds,
        follow_redirects=True,
        limits=httpx.Limits(max_connections=config.concurrency),
    ) as client:
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

                    if depth >= config.max_depth:
                        return

                    # Extract links from HTML
                    scrapy_response = HtmlResponse(
                        url=url, body=response.content, encoding="utf-8"
                    )
                    # deny_extensions=() overrides Scrapy's default deny list,
                    # which silently drops <a> links to pdf/doc/zip/image/etc.
                    # — exactly the file types this crawler exists to find.
                    # Filtering is handled explicitly via allowed_extensions/
                    # excluded_url_patterns instead.
                    extractor = LinkExtractor(deny_extensions=())
                    links = extractor.extract_links(scrapy_response)

                    for link in links:
                        link_url = normalize_url(link.url, base_url=url)
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
