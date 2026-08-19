"""
Scrapling Spider — Adaptive, self-healing web crawler using Scrapling.

Provides crawl_with_scrapling() with support for Scrapling's:
- Fetcher / AsyncFetcher for high-speed static fetching.
- StealthyFetcher for anti-bot protected sites (Cloudflare, Turnstile, Akamai).
- Adaptor / Selector for self-healing HTML element parsing.

Uses parallel task processing with asyncio.Semaphore for concurrency control.
"""
from __future__ import annotations

import asyncio
import re
from typing import Awaitable, Callable, Optional, Set

import httpx
import structlog
from scrapling import AsyncFetcher, StealthyFetcher, Selector

from app.discovery.extractor import extract_resource_urls
from app.discovery.robots import RobotsCache
from app.normalize.url_normalizer import normalize_url
from app.spiders.http_spider import (
    CrawlConfig,
    CrawlResult,
    DiscoveredFile,
    get_effective_allowed_domains,
    is_allowed_domain,
    is_allowed_resource_domain,
    is_downloadable_url,
    is_private_address,
    url_matches_pattern,
)

log = structlog.get_logger(__name__)



def extract_scrapling_links(response_or_selector: Selector | str, base_url: str) -> set[str]:
    """
    Extract all page navigation links using Scrapling Selector / Adaptor.
    """
    if isinstance(response_or_selector, str):
        selector = Selector(content=response_or_selector)
    else:
        selector = response_or_selector

    links: set[str] = set()

    # 1. Anchor links (<a href="...">)
    for href in selector.css("a::attr(href)").getall():
        if href and not href.startswith(("javascript:", "mailto:", "tel:", "#")):
            norm = normalize_url(href, base_url)
            if norm:
                links.add(norm)

    # 2. Interactive Buttons & Custom Attributes ([data-href], [data-url], [onclick], button[value])
    for attr in ["data-href", "data-url", "data-link", "value"]:
        for val in selector.css(f"[{attr}]::attr({attr})").getall():
            if val and val.startswith(("http://", "https://", "/")) and not val.startswith(("javascript:", "#")):
                norm = normalize_url(val, base_url)
                if norm:
                    links.add(norm)

    for onclick in selector.css("[onclick]::attr(onclick)").getall():
        if onclick:
            for match in re.finditer(r"['\"](https?://[^\s'\"]+|/[^\s'\"]+)['\"]", onclick):
                norm = normalize_url(match.group(1), base_url)
                if norm:
                    links.add(norm)

    # 3. Form action targets (<form action="...">)
    for action in selector.css("form::attr(action)").getall():
        if action and not action.startswith(("javascript:", "#")):
            norm = normalize_url(action, base_url)
            if norm:
                links.add(norm)

    # 4. Iframe & Embed sources
    for src in selector.css("iframe::attr(src), embed::attr(src), object::attr(data)").getall():
        if src and not src.startswith(("javascript:", "#")):
            norm = normalize_url(src, base_url)
            if norm:
                links.add(norm)

    return links


async def crawl_with_scrapling(
    config: CrawlConfig,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
    on_page_crawled: Optional[Callable[[], Awaitable[None]]] = None,
    on_file_found: Optional[Callable[[], Awaitable[None]]] = None,
    check_pause: Optional[Callable[[], Awaitable[bool]]] = None,
) -> CrawlResult:
    """
    Execute crawl using Scrapling engine with parallel task processing.

    Supports stealth mode (StealthyFetcher) for anti-bot bypass when
    config.stealth_mode is True, or AsyncFetcher for standard high-speed scraping.
    """
    result = CrawlResult()
    visited: Set[str] = set()
    queue: asyncio.Queue[tuple[str, int]] = asyncio.Queue()

    effective_allowed_domains = get_effective_allowed_domains(
        config.start_urls, config.allowed_domains
    )

    # Robots.txt cache client
    robots_client = httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
        timeout=10,
    )
    robots = RobotsCache(robots_client)

    # Initialize Scrapling Fetcher
    async_fetcher = AsyncFetcher() if not config.stealth_mode else None
    stealthy_fetcher = StealthyFetcher() if config.stealth_mode else None

    semaphore = asyncio.Semaphore(config.concurrency)

    try:
        # 1. Enqueue start URLs
        for start_url in config.start_urls:
            normalized = normalize_url(start_url)
            if not normalized:
                continue
            if await is_private_address(normalized):
                log.warning("scrapling_spider.start_url_blocked_ssrf", url=start_url)
                continue
            if normalized not in visited:
                visited.add(normalized)
                await queue.put((normalized, 0))

        async def process_url(url: str, depth: int) -> None:
            async with semaphore:
                if result.pages_crawled >= config.max_pages:
                    return
                if len(result.files_discovered) >= config.max_files:
                    return

                # Robots.txt check
                if not await robots.is_allowed(url, enabled=config.robots_enabled):
                    log.debug("scrapling_spider.robots_disallowed", url=url)
                    return

                # Fetch page content with Scrapling
                try:
                    if stealthy_fetcher:
                        loop = asyncio.get_running_loop()
                        res = await loop.run_in_executor(None, stealthy_fetcher.fetch, url)
                    elif async_fetcher:
                        res = await async_fetcher.get(url)
                    else:
                        res = await AsyncFetcher().get(url)
                except Exception as exc:
                    log.warning("scrapling_spider.fetch_failed", url=url, error=str(exc))
                    return

                status = getattr(res, "status", 200)
                if status >= 400:
                    log.warning("scrapling_spider.http_error", url=url, status=status)
                    return

                if hasattr(res, "body") and isinstance(res.body, bytes):
                    html_body = res.body.decode("utf-8", errors="ignore")
                elif hasattr(res, "html_content"):
                    html_body = str(res.html_content)
                else:
                    html_body = getattr(res, "text", "") or ""
                if not isinstance(html_body, str):
                    html_body = str(html_body)

                res_url = getattr(res, "url", url) or url

                result.pages_crawled += 1
                if on_page_crawled:
                    await on_page_crawled()

                # Extract resource files (PDF, audio, video, documents, etc.)
                resource_urls = extract_resource_urls(html_body, res_url)
                for resource_url in resource_urls:
                    norm_res = normalize_url(resource_url, res_url)
                    if not norm_res or await is_private_address(norm_res):
                        continue
                    if is_downloadable_url(norm_res, config.allowed_extensions):
                        if is_allowed_resource_domain(norm_res, effective_allowed_domains):
                            if not config.allowed_url_patterns or url_matches_pattern(norm_res, config.allowed_url_patterns):
                                if not config.excluded_url_patterns or not url_matches_pattern(norm_res, config.excluded_url_patterns):
                                    if not any(df.url == norm_res for df in result.files_discovered):
                                        result.files_discovered.append(DiscoveredFile(url=norm_res, depth=depth))
                                        if on_file_found:
                                            await on_file_found()

                # Extract links for next crawl depth
                if depth < config.max_depth:
                    scrapling_selector = Selector(content=html_body) if isinstance(html_body, str) else res
                    page_links = extract_scrapling_links(scrapling_selector, res_url)

                    for link in page_links:
                        norm_link = normalize_url(link, res_url)
                        if not norm_link or await is_private_address(norm_link):
                            continue

                        # Direct downloadable file check
                        if is_downloadable_url(norm_link, config.allowed_extensions):
                            if is_allowed_resource_domain(norm_link, effective_allowed_domains):
                                if not config.allowed_url_patterns or url_matches_pattern(norm_link, config.allowed_url_patterns):
                                    if not config.excluded_url_patterns or not url_matches_pattern(norm_link, config.excluded_url_patterns):
                                        if not any(df.url == norm_link for df in result.files_discovered):
                                            result.files_discovered.append(DiscoveredFile(url=norm_link, depth=depth + 1))
                                            if on_file_found:
                                                await on_file_found()
                            continue

                        # Follow page navigation links
                        if norm_link not in visited and is_allowed_domain(norm_link, effective_allowed_domains):
                            if not config.allowed_url_patterns or url_matches_pattern(norm_link, config.allowed_url_patterns):
                                if not config.excluded_url_patterns or not url_matches_pattern(norm_link, config.excluded_url_patterns):
                                    visited.add(norm_link)
                                    await queue.put((norm_link, depth + 1))

                if config.request_delay_ms > 0:
                    await asyncio.sleep(config.request_delay_ms / 1000.0)

        # 2. Process URLs in parallel with task pool
        tasks: list[asyncio.Task] = []
        while not queue.empty() or tasks:
            if should_cancel and await should_cancel():
                log.info("scrapling_spider.cancelled_by_user")
                result.cancelled = True
                break

            if check_pause and await check_pause():
                log.info("scrapling_spider.paused_by_user")
                break

            if result.pages_crawled >= config.max_pages:
                log.info("scrapling_spider.max_pages_reached", max_pages=config.max_pages)
                break

            if len(result.files_discovered) >= config.max_files:
                log.info("scrapling_spider.max_files_reached", max_files=config.max_files)
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
            log.info("scrapling_spider.cancelled", pages=result.pages_crawled)
        else:
            log.info(
                "scrapling_spider.complete",
                pages=result.pages_crawled,
                files=len(result.files_discovered),
            )

    finally:
        await robots_client.aclose()

    return result
