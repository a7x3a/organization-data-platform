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

from app.discovery.extractor import extract_resource_urls, extract_sitemap_locs, extract_urls_from_json_data
from app.discovery.robots import RobotsCache
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
from app.normalize.url_normalizer import normalize_url

log = structlog.get_logger(__name__)



async def crawl_with_browser(
    config: CrawlConfig,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
    on_page_crawled: Optional[Callable[[], Awaitable[None]]] = None,
    on_file_found: Optional[Callable[[], Awaitable[None]]] = None,
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
    effective_allowed_domains = get_effective_allowed_domains(
        config.start_urls, config.allowed_domains
    )

    # A plain httpx client just for robots.txt/sitemap fetches — those are
    # small, fast text requests that don't need a browser tab, even though
    # the actual pages below are rendered with Playwright.
    robots_client = httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
        timeout=10,
    )
    robots = RobotsCache(robots_client)

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
                    if not is_allowed_domain(loc_url, effective_allowed_domains):
                        continue
                    await seed(loc_url)
        except httpx.HTTPError as exc:
            log.debug("sitemap_fetch_failed", url=start_url, error=str(exc))

    log.info("browser_crawl_started", urls=config.start_urls)

    delay = config.request_delay_ms / 1000.0

    try:
        await _run_browser_crawl(
            config,
            result,
            visited,
            queue,
            robots,
            delay,
            should_cancel,
            on_page_crawled=on_page_crawled,
            on_file_found=on_file_found,
            effective_allowed_domains=effective_allowed_domains,
        )
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
    on_page_crawled: Optional[Callable[[], Awaitable[None]]] = None,
    on_file_found: Optional[Callable[[], Awaitable[None]]] = None,
    effective_allowed_domains: list[str] = [],
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
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080},
                java_script_enabled=True,
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                },
            )
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                "window.chrome = { runtime: {} };"
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
                                if on_file_found:
                                    await on_file_found()
                            return

                        if not await robots.is_allowed(url, enabled=config.robots_enabled):
                            log.debug("robots_disallowed", url=url)
                            return

                        page = await context.new_page()

                        # Intercept download attempts and API JSON responses
                        downloaded_urls: list[str] = []

                        async def handle_download(download):
                            downloaded_urls.append(download.url)
                            await download.cancel()

                        async def handle_response(response):
                            try:
                                content_type = response.headers.get("content-type", "")
                                if "json" in content_type or "/api/" in response.url or "json" in response.url:
                                    try:
                                        json_data = await response.json()
                                        json_urls = extract_urls_from_json_data(json_data, url)
                                        for json_url in json_urls:
                                            norm_json = normalize_url(json_url, base_url=url)
                                            if norm_json and norm_json not in visited:
                                                if is_downloadable_url(norm_json, config.allowed_extensions):
                                                    if is_allowed_resource_domain(norm_json, effective_allowed_domains):
                                                        visited.add(norm_json)
                                                        result.files_discovered.append(DiscoveredFile(url=norm_json, depth=depth))
                                                        log.info("file_discovered_via_api_response", url=norm_json, api=response.url)
                                                        if on_file_found:
                                                            await on_file_found()
                                    except Exception:
                                        pass
                            except Exception:
                                pass

                        page.on("download", handle_download)
                        page.on("response", handle_response)

                        try:
                            await page.goto(
                                url,
                                timeout=config.request_timeout_seconds * 1000,
                                wait_until="networkidle" if "ktebstan.net" in url or "wixsite.com" in url or "kurdipedia.org" in url else "domcontentloaded",
                            )
                            from app.spiders.cf_bypass import handle_cloudflare_challenge
                            await handle_cloudflare_challenge(page, max_wait_seconds=15)
                            # Scroll page to trigger lazy loading / dynamic rendering
                            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                            await asyncio.sleep(1.0)
                        except Exception:
                            pass

                        result.pages_crawled += 1
                        log.debug("browser_page_crawled", url=url, depth=depth)
                        if on_page_crawled:
                            await on_page_crawled()

                        # Add any intercepted download URLs
                        for dl_url in downloaded_urls:
                            if len(result.files_discovered) >= config.max_files:
                                break
                            if dl_url not in visited:
                                if is_downloadable_url(dl_url, config.allowed_extensions):
                                    visited.add(dl_url)
                                    result.files_discovered.append(
                                        DiscoveredFile(url=dl_url, depth=depth)
                                    )
                                    if on_file_found:
                                        await on_file_found()

                        # Embedded resources (images, video/audio sources,
                        # embedded objects, feed enclosures, inline-script
                        # URLs) from the fully rendered DOM
                        rendered_html = await page.content()
                        extra_page_candidates: set[str] = set()
                        for resource_url in extract_resource_urls(rendered_html, url):
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
                                        result.files_discovered.append(
                                            DiscoveredFile(url=normalized, depth=depth)
                                        )
                                        log.debug(
                                            "file_discovered", url=normalized, via="embedded_resource"
                                        )
                                        if on_file_found:
                                            await on_file_found()
                            else:
                                if is_allowed_domain(normalized, effective_allowed_domains):
                                    extra_page_candidates.add(normalized)

                        if depth >= config.max_depth:
                            return

                        page_title = ""
                        try:
                            page_title = await page.title()
                        except Exception:
                            pass

                        # Extract links, titles & download targets from rendered DOM
                        links_data = await page.eval_on_selector_all(
                            "a[href], [download], [data-href], [data-download], [data-url], [data-document-url], [data-media-id], [data-uri]",
                            r"""els => els.map(el => {
                                let target = el.href || el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-download') || el.getAttribute('data-url') || el.getAttribute('data-document-url') || el.getAttribute('data-uri');
                                if (target && (target.startsWith('ugd/') || target.includes('usrfiles.com')) && !target.startsWith('http')) {
                                    target = 'https://usrfiles.com/' + target.replace(/^[\/]+/, '');
                                }
                                let text = (el.textContent || '').trim();
                                let title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
                                return { target, text, title };
                            }).filter(x => Boolean(x.target))""",
                        )

                        from app.spiders.http_spider import transform_cloud_storage_url

                        for item in links_data:
                            if len(result.files_discovered) >= config.max_files:
                                break
                            raw_link_url = item.get("target") if isinstance(item, dict) else item
                            if not isinstance(raw_link_url, str):
                                continue
                            transformed_url = transform_cloud_storage_url(raw_link_url)
                            link_url = normalize_url(transformed_url, base_url=url)
                            if link_url is None or link_url in visited:
                                continue

                            ctx_name = item.get("text") or item.get("title") or page_title if isinstance(item, dict) else page_title

                            if is_downloadable_url(link_url, config.allowed_extensions):
                                if is_allowed_resource_domain(link_url, effective_allowed_domains):
                                    if not url_matches_pattern(link_url, config.excluded_url_patterns):
                                        if len(result.files_discovered) < config.max_files:
                                            visited.add(link_url)
                                            result.files_discovered.append(
                                                DiscoveredFile(
                                                    url=link_url,
                                                    depth=depth,
                                                    context_name=ctx_name,
                                                    page_title=page_title,
                                                    page_url=url,
                                                )
                                            )
                                            log.info("file_discovered_via_dom", url=link_url, context=ctx_name)
                                            if on_file_found:
                                                await on_file_found()
                                continue

                            if not is_allowed_domain(link_url, effective_allowed_domains):
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
