"""
HTTP Spider — httpx-based web crawler with sitemap + embedded-resource
discovery (see app.discovery).

Used for normal pages that do not require JavaScript rendering.
Playwright is NOT launched here.
"""
import asyncio
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, Set
from urllib.parse import urlparse

import httpx
import structlog

from app.discovery.extractor import (
    extract_page_links,
    extract_page_links_with_context,
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
    use_scrapling: bool = False
    stealth_mode: bool = False
    extract_web_data: bool = False


@dataclass
class DiscoveredFile:
    url: str
    depth: int
    context_name: Optional[str] = None
    page_title: Optional[str] = None
    page_url: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


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
    # Ebooks & Books
    ".pdf", ".epub", ".mobi", ".azw3", ".fb2",
    # Documents & Office
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".txt", ".md",
    # Data & Datasets
    ".csv", ".tsv", ".jsonl", ".json", ".xml", ".parquet", ".srt", ".vtt",
    # Archives
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
    # Audiobooks & Media
    ".mp3", ".wav", ".flac", ".ogg", ".opus", ".m4a", ".aac",
    ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv",
    # Images (Content)
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic",
}

# Extensions that mean "this is another page to crawl", never a standalone
# downloadable file — the boundary used by the discover-everything fallback
# below to decide "URL with an unrecognized extension" from "URL with no
# real extension at all" (e.g. a clean article slug like /articles/my-post).
_PAGE_EXTENSIONS = {
    ".html", ".htm", ".php", ".asp", ".aspx", ".jsp", ".cfm", ".shtml", "",
}


def get_effective_allowed_domains(start_urls: list[str], allowed_domains: list[str]) -> list[str]:
    """
    Return effective allowed domains.

    If `allowed_domains` is explicitly set in configuration, use it.
    Otherwise, automatically derive allowed domains from hostnames of `start_urls`
    so the crawler stays within the source's domain(s) and never escapes to external sites.
    """
    if allowed_domains:
        return [d.strip().lower() for d in allowed_domains if d.strip()]

    domains: set[str] = set()
    for raw_url in start_urls:
        hostname = urlparse(raw_url).hostname
        if hostname:
            domains.add(hostname.lower())
    return list(domains)


def transform_cloud_storage_url(url: str) -> str:
    """
    Transform cloud storage share URLs (Google Drive, Dropbox) into direct download URLs.
    """
    if "drive.google.com" in url or "docs.google.com" in url:
        # Convert https://drive.google.com/file/d/FILE_ID/view... -> https://drive.google.com/uc?export=download&id=FILE_ID
        match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", url)
        if match:
            file_id = match.group(1)
            return f"https://drive.google.com/uc?export=download&id={file_id}"
    elif "dropbox.com" in url:
        if "dl=0" in url:
            return url.replace("dl=0", "dl=1")
        elif "dl=1" not in url and "?" not in url:
            return f"{url}?dl=1"
    return url


def is_downloadable_url(url: str, allowed_extensions: list[str]) -> bool:
    """
    Check if a URL points to a downloadable file based on file extension, query parameters, or path segments.

    If `allowed_extensions` is configured, only matching extensions are accepted.
    If `allowed_extensions` is empty, match against DOWNLOADABLE_EXTENSIONS.
    Website theme assets (.css, .js, .svg, .ico, .woff, .ttf) are explicitly ignored.
    """
    parsed = urlparse(url)
    path = parsed.path.lower()
    query = parsed.query.lower()

    # Ignore UI theme assets (stylesheets, scripts, vectors, site icons, webfonts)
    if any(path.endswith(ignored) for ignored in (".css", ".js", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot")):
        return False

    targets = [ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in allowed_extensions] if allowed_extensions else DOWNLOADABLE_EXTENSIONS

    # 1. Path extension check (e.g. /books/history.pdf, usrfiles.com/ugd/xyz.pdf, cdn.gov.krd/file.pdf)
    if any(path.endswith(ext) for ext in targets):
        return True

    # 2. Query parameter check (e.g. /download.php?file=book.pdf or ?format=pdf or ?ext=pdf)
    if query:
        for ext in targets:
            clean_ext = ext.lstrip(".")
            if f".{clean_ext}" in query or f"format={clean_ext}" in query or f"type={clean_ext}" in query or f"file={clean_ext}" in query or f"ext={clean_ext}" in query:
                return True
        if not allowed_extensions:
            if "export=download" in query or "dl=1" in query or "download=true" in query:
                return True

    # 3. Download path segment check (e.g. /download/pdf/123, /download/epub/456)
    for ext in targets:
        clean_ext = ext.lstrip(".")
        if f"/{clean_ext}/" in path or path.endswith(f"/{clean_ext}"):
            return True

    # 4. Special handling for Google Drive & Dropbox downloads
    if ("drive.google.com" in url or "docs.google.com" in url) and ("export=download" in query or "/file/d/" in path or "/uc" in path):
        if not allowed_extensions or any(ext in (".pdf", ".docx", ".zip", ".xlsx", ".epub") for ext in targets):
            return True

    # 5. Wix document CDN (usrfiles.com/ugd/..., static.wixstatic.com/docs/...)
    if "usrfiles.com" in url or "wixstatic.com/docs" in url:
        if any(ext in path or ext in query for ext in targets):
            return True

    return False


def url_matches_pattern(url: str, patterns: list[str]) -> bool:
    """Return True if the URL matches any of the given regex patterns."""
    return any(re.search(pattern, url) for pattern in patterns)


KNOWN_CDN_DOMAINS = {
    "cdn.gov.krd",    # Kurdistan Regional Government Asset CDN
    "gov.krd",        # Kurdistan Government Domain & Storage
    "kurdipedia.org", # Kurdipedia Digital Library & File Repository
    "usrfiles.com",   # Wix user document CDN (usrfiles.com/ugd/...)
    "wixstatic.com",  # Wix media & static asset CDN
    "wix.com",
    "wixsite.com",
    "vercel-storage.com",
    "amazonaws.com",
    "googleapis.com",
    "drive.google.com",
    "docs.google.com",
    "cloudflarestorage.com",
    "r2.dev",
    "cloudinary.com",
    "archive.org",
    "dropbox.com",
    "mediafire.com",
    "wikimedia.org",
    "githubusercontent.com",
}


def is_allowed_domain(url: str, allowed_domains: list[str]) -> bool:
    """Return True if the URL's domain is in the allowed list (or list is empty)."""
    if not allowed_domains:
        return True
    hostname = (urlparse(url).hostname or "").lower()
    if not hostname:
        return False

    clean_host = hostname[4:] if hostname.startswith("www.") else hostname
    for domain in allowed_domains:
        d = domain.lower()
        clean_d = d[4:] if d.startswith("www.") else d
        if clean_host == clean_d or clean_host.endswith(f".{clean_d}") or clean_d.endswith(f".{clean_host}"):
            return True
    return False


def is_allowed_resource_domain(url: str, allowed_domains: list[str]) -> bool:
    """
    Return True if the resource URL (PDF, audio, document) is allowed.
    Resource files hosted on trusted cloud storage/CDNs linked from target pages are permitted.
    """
    if is_allowed_domain(url, allowed_domains):
        return True
    hostname = (urlparse(url).hostname or "").lower()
    if not hostname:
        return False
    return any(hostname == cdn or hostname.endswith(f".{cdn}") for cdn in KNOWN_CDN_DOMAINS)



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

    return any(_is_private_ip(str(info[4][0])) for info in resolved)


async def crawl(
    config: CrawlConfig,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
    on_page_crawled: Optional[Callable[[], Awaitable[None]]] = None,
    on_file_found: Optional[Callable[[], Awaitable[None]]] = None,
    on_page_data: Optional[Callable[[dict[str, Any]], Awaitable[None]]] = None,
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ku;q=0.8,ar;q=0.7",
    }

    delay = config.request_delay_ms / 1000.0

    effective_allowed_domains = get_effective_allowed_domains(
        config.start_urls, config.allowed_domains
    )

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
            if not is_allowed_domain(url, effective_allowed_domains):
                log.debug("domain_disallowed", url=url)
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
                        if not is_allowed_domain(loc_url, effective_allowed_domains):
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
                            if len(result.files_discovered) < config.max_files:
                                result.files_discovered.append(DiscoveredFile(url=url, depth=depth))
                                log.debug("file_discovered", url=url)
                                if on_file_found:
                                    await on_file_found()
                        return

                    if not await robots.is_allowed(url, enabled=config.robots_enabled):
                        log.debug("robots_disallowed", url=url)
                        return

                    # Fetch page
                    response = await client.get(url)
                    result.pages_crawled += 1
                    if on_page_crawled:
                        await on_page_crawled()

                    if response.status_code != 200:
                        return

                    content_type = response.headers.get("content-type", "")
                    if "text/html" not in content_type:
                        # Direct non-HTML file — only accept if valid for allowed_extensions
                        if is_downloadable_url(url, config.allowed_extensions):
                            if not url_matches_pattern(url, config.excluded_url_patterns):
                                if len(result.files_discovered) < config.max_files:
                                    result.files_discovered.append(DiscoveredFile(url=url, depth=depth))
                                    if on_file_found:
                                        await on_file_found()
                        return

                    log.debug("page_crawled", url=url, depth=depth)
                    html = response.text

                    if config.extract_web_data and on_page_data:
                        from app.discovery.extractor import extract_structured_page_data
                        page_doc = extract_structured_page_data(html, url)
                        if page_doc.get("body_text"):
                            await on_page_data(page_doc)

                    # Every non-<a> resource this page points to
                    extra_page_candidates: set[str] = set()
                    for resource_url in extract_resource_urls(html, url):
                        if len(result.files_discovered) >= config.max_files:
                            break
                        normalized = normalize_url(resource_url, base_url=url)
                        if normalized is None or normalized in visited:
                            continue
                        if await is_private_address(normalized):
                            continue
                        if url_matches_pattern(normalized, config.excluded_url_patterns):
                            continue

                        if is_downloadable_url(normalized, config.allowed_extensions):
                            if is_allowed_resource_domain(normalized, effective_allowed_domains):
                                if len(result.files_discovered) < config.max_files:
                                    visited.add(normalized)
                                    result.files_discovered.append(DiscoveredFile(url=normalized, depth=depth))
                                    log.debug("file_discovered", url=normalized, via="embedded_resource")
                                    if on_file_found:
                                        await on_file_found()
                        else:
                            if is_allowed_domain(normalized, effective_allowed_domains):
                                extra_page_candidates.add(normalized)

                    # Automatic REST API probe for SPA sites (e.g. ktebstan.net)
                    if "ktebstan.net" in url.lower():
                        api_endpoint = "https://www.ktebstan.net/api/books?page=1&limit=500&sortBy=download&sortOrder=desc"
                        try:
                            api_res = await client.get(api_endpoint)
                            if api_res.status_code == 200:
                                api_data = api_res.json()
                                books = api_data.get("books", []) if isinstance(api_data, dict) else api_data
                                for book in books:
                                    if len(result.files_discovered) >= config.max_files:
                                        break
                                    file_name = book.get("file_url")
                                    audio_url = book.get("audio_file_url")
                                    if file_name and isinstance(file_name, str):
                                        full_pdf_url = f"https://z4l1g0tev5tfrvnx.public.blob.vercel-storage.com/{file_name}"
                                        if is_downloadable_url(full_pdf_url, config.allowed_extensions) and full_pdf_url not in visited:
                                            if len(result.files_discovered) < config.max_files:
                                                visited.add(full_pdf_url)
                                                result.files_discovered.append(DiscoveredFile(url=full_pdf_url, depth=depth + 1))
                                                if on_file_found:
                                                    await on_file_found()
                                    if audio_url and isinstance(audio_url, str):
                                        if is_downloadable_url(audio_url, config.allowed_extensions) and audio_url not in visited:
                                            if len(result.files_discovered) < config.max_files:
                                                visited.add(audio_url)
                                                result.files_discovered.append(DiscoveredFile(url=audio_url, depth=depth + 1))
                                                if on_file_found:
                                                    await on_file_found()
                        except Exception as api_err:
                            log.warning("spa_api_probe_failed", url=url, error=str(api_err))

                    # Diagnostic log if HTML body is very small (< 2.5KB) with no downloadable files
                    if len(html) < 2500 and not result.files_discovered:
                        log.info("spa_shell_detected_recommend_browser_or_scrapling", url=url, html_bytes=len(html))

                    if depth >= config.max_depth:
                        return

                    # Extract links with rich context from HTML
                    page_link_contexts = extract_page_links_with_context(html, url)
                    for link, ctx in page_link_contexts:
                        if len(result.files_discovered) >= config.max_files:
                            break
                        link_url = normalize_url(link, base_url=url)
                        if link_url is None:
                            continue

                        # Check if link target is a downloadable file
                        if is_downloadable_url(link_url, config.allowed_extensions):
                            if is_allowed_resource_domain(link_url, effective_allowed_domains):
                                if not url_matches_pattern(link_url, config.excluded_url_patterns):
                                    if len(result.files_discovered) < config.max_files and not any(df.url == link_url for df in result.files_discovered):
                                        result.files_discovered.append(
                                            DiscoveredFile(
                                                url=link_url,
                                                depth=depth,
                                                context_name=ctx.get("best_name"),
                                                page_title=ctx.get("page_title"),
                                                page_url=url,
                                                metadata=ctx,
                                            )
                                        )
                                        log.debug("file_discovered_with_context", url=link_url, context=ctx.get("best_name"))
                                        if on_file_found:
                                            await on_file_found()
                            continue

                        # Navigation page / route traversal (menus, categories, pagination)
                        if link_url not in visited and is_allowed_domain(link_url, effective_allowed_domains):
                            if not await is_private_address(link_url):
                                if not config.allowed_url_patterns or url_matches_pattern(link_url, config.allowed_url_patterns):
                                    if not url_matches_pattern(link_url, config.excluded_url_patterns):
                                        visited.add(link_url)
                                        await queue.put((link_url, depth + 1))

                    # Also queue extra non-file embedded candidates (if any)
                    for cand in extra_page_candidates:
                        c_url = normalize_url(cand, base_url=url)
                        if c_url and c_url not in visited and is_allowed_domain(c_url, effective_allowed_domains):
                            if not await is_private_address(c_url):
                                if not config.allowed_url_patterns or url_matches_pattern(c_url, config.allowed_url_patterns):
                                    if not url_matches_pattern(c_url, config.excluded_url_patterns):
                                        visited.add(c_url)
                                        await queue.put((c_url, depth + 1))

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
