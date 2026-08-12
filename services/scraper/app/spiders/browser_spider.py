"""
Browser Spider — Playwright-based crawler for JavaScript-heavy pages.

Only launched when collector configuration has use_browser = True.
Chromium is NOT started for normal HTTP pages.
"""
import asyncio
from typing import Optional, Set
from urllib.parse import urlparse

import structlog
from playwright.async_api import async_playwright, Browser, Page

from app.spiders.http_spider import (
    CrawlConfig,
    CrawlResult,
    DiscoveredFile,
    is_allowed_domain,
    is_downloadable_url,
    is_private_address,
    url_matches_pattern,
    DOWNLOADABLE_EXTENSIONS,
)
from app.normalize.url_normalizer import normalize_url

log = structlog.get_logger(__name__)


async def crawl_with_browser(config: CrawlConfig) -> CrawlResult:
    """
    Playwright-based crawl for JavaScript-heavy pages.

    Uses one shared browser instance.
    Only launched when explicitly required — never for normal pages.
    """
    result = CrawlResult()
    visited: Set[str] = set()
    queue: asyncio.Queue = asyncio.Queue()

    for raw_url in config.start_urls:
        url = normalize_url(raw_url)
        if url is None:
            log.warning("malformed_or_unsupported_url", url=raw_url)
            continue
        if is_private_address(url):
            log.warning("ssrf_blocked", url=url)
            continue
        await queue.put((url, 0))
        visited.add(url)

    log.info("browser_crawl_started", urls=config.start_urls)

    delay = config.request_delay_ms / 1000.0

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

                        if depth >= config.max_depth:
                            return

                        # Extract links from rendered DOM
                        links = await page.eval_on_selector_all(
                            "a[href]",
                            "els => els.map(el => el.href)",
                        )

                        for raw_link_url in links:
                            if not isinstance(raw_link_url, str):
                                continue
                            link_url = normalize_url(raw_link_url, base_url=url)
                            if link_url is None:
                                continue
                            if link_url in visited:
                                continue
                            if not is_allowed_domain(link_url, config.allowed_domains):
                                continue
                            if is_private_address(link_url):
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

        finally:
            await browser.close()
            log.info("browser_closed")

    log.info(
        "browser_crawl_complete",
        pages=result.pages_crawled,
        files=len(result.files_discovered),
    )
    return result
