"""
Browser Spider — Playwright-based crawler for JavaScript-heavy pages.

Only launched when collector configuration has use_browser = True.
Chromium is NOT started for normal HTTP pages.
"""
import asyncio
from typing import Awaitable, Callable, Optional, Set

import httpx
import structlog
from playwright.async_api import async_playwright, Browser, Page

from app.discovery.extractor import extract_resource_urls, extract_sitemap_locs
from app.discovery.robots import RobotsCache
from app.spiders.http_spider import (
    CrawlConfig,
    CrawlResult,
    DiscoveredFile,
    is_allowed_domain,
    is_downloadable_url,
    is_private_address,
    url_matches_pattern,
)
from app.normalize.url_normalizer import normalize_url

log = structlog.get_logger(__name__)


async def crawl_with_browser(
    config: CrawlConfig,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
) -> CrawlResult:
    """
    Playwright-based crawl for JavaScript-heavy pages.

    Uses one shared browser instance.
    Only launched when explicitly required — never for normal pages.
    """
    result = CrawlResult()
    visited: Set[str] = set()
    queue: asyncio.Queue = asyncio.Queue()

    # A plain httpx client just for robots.txt/sitemap fetches — those are
    # small, fast text requests that don't need a browser tab, even though
    # the actual pages below are rendered with Playwright.
    robots_client = httpx.AsyncClient(
        headers={"User-Agent": "ODP-Collector/1.0 (+https://github.com/org/data-platform)"},
        timeout=10,
    )
    robots = RobotsCache(robots_client)

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

    for raw_url in config.start_urls:
        start_url = normalize_url(raw_url)
        if start_url is None:
            log.warning("malformed_or_unsupported_url", url=raw_url)
            continue
        await seed(start_url)

        try:
            for sitemap_url in await robots.sitemaps_for(start_url):
                sitemap_resp = await robots_client.get(sitemap_url)
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

    log.info("browser_crawl_started", urls=config.start_urls)

    delay = config.request_delay_ms / 1000.0

    try:
        await _run_browser_crawl(config, result, visited, queue, robots, delay, should_cancel)
    finally:
        await robots_client.aclose()

    if result.cancelled:
        log.info("browser_crawl_cancelled", pages=result.pages_crawled)
    else:
        log.info(
            "browser_crawl_complete",
            pages=result.pages_crawled,
            files=len(result.files_discovered),
        )
    return result


async def _run_browser_crawl(
    config: CrawlConfig,
    result: CrawlResult,
    visited: Set[str],
    queue: asyncio.Queue,
    robots: RobotsCache,
    delay: float,
    should_cancel: Optional[Callable[[], Awaitable[bool]]],
) -> None:
    async with async_playwright() as p:
        browser: Browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )

        try:
            context = await browser.new_context(
                user_agent="ODP-Collector/1.0 (+https://github.com/org/data-platform)",
                java_script_enabled=True,
            )

            semaphore = asyncio.Semaphore(min(config.concurrency, 4))

            async def process_page(url: str, depth: int) -> None:
                async with semaphore:
                    if result.pages_crawled >= config.max_pages:
                        return
                    if len(result.files_discovered) >= config.max_files:
                        return

                    await asyncio.sleep(delay)
                    page: Optional[Page] = None

                    try:
                        if is_downloadable_url(url, config.allowed_extensions):
                            if not url_matches_pattern(url, config.excluded_url_patterns):
                                result.files_discovered.append(
                                    DiscoveredFile(url=url, depth=depth)
                                )
                            return

                        if not await robots.is_allowed(url, enabled=config.robots_enabled):
                            log.debug("robots_disallowed", url=url)
                            return

                        page = await context.new_page()

                        # Intercept download attempts instead of navigating
                        downloaded_urls: list[str] = []

                        async def handle_download(download):
                            downloaded_urls.append(download.url)
                            await download.cancel()

                        page.on("download", handle_download)

                        try:
                            await page.goto(
                                url,
                                timeout=config.request_timeout_seconds * 1000,
                                wait_until="domcontentloaded",
                            )
                        except Exception:
                            pass

                        result.pages_crawled += 1
                        log.debug("browser_page_crawled", url=url, depth=depth)

                        # Add any intercepted download URLs
                        for dl_url in downloaded_urls:
                            if dl_url not in visited:
                                visited.add(dl_url)
                                result.files_discovered.append(
                                    DiscoveredFile(url=dl_url, depth=depth)
                                )

                        # Embedded resources (images, video/audio sources,
                        # embedded objects, feed enclosures, inline-script
                        # URLs) from the fully rendered DOM — same extractor
                        # http_spider uses, applied to Playwright's rendered
                        # HTML instead of the raw response body. This is what
                        # a JS-heavy site needs: its download buttons/media
                        # tags often don't exist until after rendering.
                        rendered_html = await page.content()
                        extra_page_candidates: set[str] = set()
                        for resource_url in extract_resource_urls(rendered_html, url):
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
                                result.files_discovered.append(
                                    DiscoveredFile(url=normalized, depth=depth)
                                )
                                log.debug(
                                    "file_discovered", url=normalized, via="embedded_resource"
                                )
                            else:
                                extra_page_candidates.add(normalized)

                        if depth >= config.max_depth:
                            return

                        # Extract links from rendered DOM
                        links = await page.eval_on_selector_all(
                            "a[href]",
                            "els => els.map(el => el.href)",
                        )

                        for raw_link_url in [*links, *extra_page_candidates]:
                            if not isinstance(raw_link_url, str):
                                continue
                            link_url = normalize_url(raw_link_url, base_url=url)
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

                    except Exception as exc:
                        log.error("browser_page_error", url=url, error=str(exc))
                    finally:
                        if page:
                            await page.close()

            tasks = []
            while not queue.empty() or tasks:
                # Same cancellation checkpoint as the HTTP crawler — a
                # browser crawl can wander for a long time (many pages, no
                # domain restriction, slow JS-heavy sites), with no other
                # way to stop it short of killing the whole worker process.
                if should_cancel is not None and await should_cancel():
                    result.cancelled = True
                    break

                while not queue.empty():
                    url, depth = await queue.get()
                    task = asyncio.create_task(process_page(url, depth))
                    tasks.append(task)
                    if len(tasks) >= config.concurrency:
                        break

                if tasks:
                    done, tasks_set = await asyncio.wait(
                        tasks, return_when=asyncio.FIRST_COMPLETED
                    )
                    tasks = list(tasks_set)

                if queue.empty() and not tasks:
                    break

            if result.cancelled:
                for task in tasks:
                    task.cancel()

        finally:
            await browser.close()
            log.info("browser_closed")
