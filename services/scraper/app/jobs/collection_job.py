"""
Collection Job — orchestrates the full collection pipeline for one run.

Pipeline:
  1. Update run status → RUNNING
  2. Crawl (HTTP or Browser)
  3. For each discovered file:
     a. Check duplicate (source URL + SHA-256)
     b. Stream download + hash (with retry)
     c. Upload to R2
     d. Record metadata
  4. Upload metadata.jsonl and manifest.json to R2
  5. Update run status → COMPLETED / FAILED

Steps 3c/3d/4's dedup-upload-record logic is shared with the Telegram
collector via app.pipeline.file_pipeline.FilePipeline — only discovery
(this file's crawl step) and the download mechanics (streaming HTTP here,
Telethon media download there) differ between collector types.
"""
import asyncio
import os
import random
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import structlog

from app.config.settings import settings
from app.downloader.downloader import (
    download_file,
    extract_filename,
    DownloadCancelled,
    DownloadError,
    FileTooLargeError,
)
from app.pipeline.file_pipeline import FilePipeline
from app.spiders.http_spider import crawl, CrawlConfig, CrawlResult
from app.spiders.browser_spider import crawl_with_browser
from app.spiders.scrapling_spider import crawl_with_scrapling
from app.storage import storage
from app.storage.metadata_writer import MetadataWriter
from app.storage.manifest_writer import ManifestWriter

log = structlog.get_logger(__name__)

# Retryable HTTP status codes — transient server errors worth retrying
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class CollectionJob:
    """
    Executes one WEB collection run end-to-end.

    job_data keys (from BullMQ):
        runId           — CollectionRun database ID
        collectorId
        sourceId
        sourceSlug
        configuration   — CollectorConfiguration dict
        runFolderKey    — R2 prefix: 00_raw/web/{slug}/{run_id}
    """

    def __init__(self, job_data: dict[str, Any], api_client: httpx.AsyncClient) -> None:
        self._data = job_data
        self._api = api_client
        self._run_db_id: str = job_data["runId"]
        self._cfg: dict = job_data["configuration"]
        self._run_folder_key: str = job_data["runFolderKey"]
        self._source_slug: str = job_data["sourceSlug"]
        self._pipeline = FilePipeline(
            api_client=api_client,
            run_db_id=self._run_db_id,
            source_id=job_data["sourceId"],
            run_folder_key=self._run_folder_key,
        )

    async def run(self) -> None:
        started_at = datetime.now(timezone.utc)
        log.info(
            "collection_started",
            run_id=self._run_db_id,
            source=self._source_slug,
        )

        if await self._pipeline.is_cancelled():
            log.info("collection_cancelled_before_start", run_id=self._run_db_id)
            manifest = ManifestWriter(
                run_id=self._run_db_id,
                source_name=self._source_slug,
                run_folder_key=self._run_folder_key,
                collector_version=self._data.get("collectorVersion", "1.0.0"),
                started_at=started_at,
            )
            metadata = MetadataWriter(self._run_folder_key, self._source_slug)
            await self._finalize(manifest, metadata, status="CANCELLED")
            return

        await self._pipeline.update_run_status("RUNNING", startedAt=started_at.isoformat())

        manifest = ManifestWriter(
            run_id=self._run_db_id,
            source_name=self._source_slug,
            run_folder_key=self._run_folder_key,
            collector_version=self._data.get("collectorVersion", "1.0.0"),
            started_at=started_at,
        )
        metadata = MetadataWriter(self._run_folder_key, self._source_slug)

        try:
            use_scrapling = self._cfg.get("useScrapling", False) or self._cfg.get("spiderEngine") in ("scrapling", "scrapling_stealth")
            stealth_mode = self._cfg.get("stealthMode", False) or self._cfg.get("spiderEngine") == "scrapling_stealth"

            # 1. Discover files
            crawl_config = CrawlConfig(
                start_urls=self._cfg.get("startUrls", []),
                allowed_domains=self._cfg.get("allowedDomains", []),
                allowed_url_patterns=self._cfg.get("allowedUrlPatterns", []),
                excluded_url_patterns=self._cfg.get("excludedUrlPatterns", []),
                allowed_extensions=self._cfg.get("allowedExtensions", []),
                allowed_mime_types=self._cfg.get("allowedMimeTypes", []),
                max_depth=self._cfg.get("maxDepth", 5),
                max_pages=self._cfg.get("maxPages", 10000),
                max_files=self._cfg.get("maxFiles", 10000),
                request_delay_ms=self._cfg.get("requestDelayMs", 1000),
                concurrency=self._cfg.get("concurrency", 4),
                request_timeout_seconds=self._cfg.get("requestTimeoutSeconds", 30),
                max_retries=self._cfg.get("maxRetries", 3),
                robots_enabled=self._cfg.get("robotsEnabled", True),
                use_scrapling=use_scrapling,
                stealth_mode=stealth_mode,
            )

            async def on_page_crawled() -> None:
                manifest.record_page_crawled()
                await self._pipeline.report_progress(manifest)

            async def on_file_found() -> None:
                manifest.record_file_found()
                await self._pipeline.report_progress(manifest)

            # Autonomous Auto-Engine & Stealth Detection:
            # If the user hasn't explicitly set spider options, inspect start URLs for known JS/SPA/Anti-Bot sites
            # (Wix, Vercel, Netlify, WordPress.com, Cloudflare, etc.) and automatically activate Scrapling & Stealth Playwright.
            known_js_domains = ("gov.krd", "wixsite.com", "wix.com", "usrfiles.com", "vercel.app", "netlify.app", "notion.site", "gitbook.io", "medium.com", "archive.org")
            start_urls = self._cfg.get("startUrls", [])
            auto_js_site = any(any(dom in url.lower() for dom in known_js_domains) for url in start_urls)

            use_scrapling = self._cfg.get("useScrapling", False) or self._cfg.get("spiderEngine") in ("scrapling", "scrapling_stealth") or auto_js_site
            stealth_mode = self._cfg.get("stealthMode", False) or self._cfg.get("spiderEngine") == "scrapling_stealth" or auto_js_site
            use_browser = self._cfg.get("useBrowser", False) or auto_js_site

            crawl_result = CrawlResult()

            # Step 1: Execute primary engine (Scrapling if stealth/auto-JS site, otherwise standard crawler)
            if use_scrapling:
                log.info("auto_engine_selected_scrapling", run_id=self._run_db_id, stealth=stealth_mode, auto_detected=auto_js_site)
                try:
                    crawl_result = await crawl_with_scrapling(
                        crawl_config,
                        should_cancel=self._pipeline.is_cancelled,
                        on_page_crawled=on_page_crawled,
                        on_file_found=on_file_found,
                        check_pause=self._pipeline.wait_if_paused,
                    )
                except Exception as exc:
                    log.warning("scrapling_engine_failed_attempting_fallback", run_id=self._run_db_id, error=str(exc))

            elif use_browser:
                log.info("auto_engine_selected_playwright", run_id=self._run_db_id)
                try:
                    crawl_result = await crawl_with_browser(
                        crawl_config,
                        should_cancel=self._pipeline.is_cancelled,
                        on_page_crawled=on_page_crawled,
                        on_file_found=on_file_found,
                    )
                except Exception as exc:
                    log.warning("browser_engine_failed_attempting_fallback", run_id=self._run_db_id, error=str(exc))
            else:
                log.info("auto_engine_selected_http_streaming", run_id=self._run_db_id)
                crawl_result = await crawl(
                    crawl_config,
                    should_cancel=self._pipeline.is_cancelled,
                    on_page_crawled=on_page_crawled,
                    on_file_found=on_file_found,
                )

            # Step 2: Autonomous Cascade Fallback — if primary engine found 0 files on a dynamic site,
            # automatically cascade through Playwright Chromium & Scrapling Stealth to guarantee complete coverage.
            if not crawl_result.files_discovered and not crawl_result.cancelled:
                is_canc = await self._pipeline.is_cancelled() if self._pipeline.is_cancelled else False
                if not is_canc:
                    log.info("crawl_found_0_files_initiating_playwright_stealth_cascade", run_id=self._run_db_id)
                    try:
                        browser_result = await crawl_with_browser(
                            crawl_config,
                            should_cancel=self._pipeline.is_cancelled,
                            on_page_crawled=on_page_crawled,
                            on_file_found=on_file_found,
                        )
                        if browser_result.files_discovered or browser_result.pages_crawled > crawl_result.pages_crawled:
                            crawl_result = browser_result
                    except Exception as exc:
                        log.warning("playwright_cascade_fallback_failed", run_id=self._run_db_id, error=str(exc))

                    # Step 3: If still 0 files, trigger Scrapling Stealth Engine
                    if not crawl_result.files_discovered and not is_canc:
                        log.info("crawl_found_0_files_initiating_scrapling_stealth_cascade", run_id=self._run_db_id)
                        try:
                            scrapling_result = await crawl_with_scrapling(
                                crawl_config,
                                should_cancel=self._pipeline.is_cancelled,
                                on_page_crawled=on_page_crawled,
                                on_file_found=on_file_found,
                                check_pause=self._pipeline.wait_if_paused,
                            )
                            if scrapling_result.files_discovered or scrapling_result.pages_crawled > crawl_result.pages_crawled:
                                crawl_result = scrapling_result
                        except Exception as exc:
                            log.warning("scrapling_cascade_fallback_failed", run_id=self._run_db_id, error=str(exc))

            if crawl_result.cancelled:
                # Cancelled during the crawl phase itself — before this,
                # cancellation was only checked between crawl and download,
                # so a run stuck crawling (many pages, unrestricted domains,
                # a slow JS-heavy site) couldn't be stopped short of killing
                # the worker process.
                log.info("collection_cancelled", run_id=self._run_db_id)
                await self._finalize(manifest, metadata, status="CANCELLED")
                return

            # 2. Download and upload files concurrently, bounded by the
            # collector's configured concurrency. This used to be a plain
            # sequential `for` loop — one file at a time regardless of the
            # concurrency setting — which made runs with many/large files
            # far slower than the config implied.
            concurrency = max(1, self._cfg.get("concurrency", 4))
            semaphore = asyncio.Semaphore(concurrency)

            async def bounded_process(discovered) -> None:
                async with semaphore:
                    if await self._pipeline.wait_if_paused():
                        raise DownloadCancelled(f"Cancelled while paused: {discovered.url}")
                    if await self._pipeline.is_cancelled():
                        raise DownloadCancelled(f"Cancelled before starting {discovered.url}")
                    
                    pref_name = getattr(discovered, "context_name", None) or getattr(discovered, "page_title", None)
                    await self._process_file(
                        discovered.url,
                        preferred_name=pref_name,
                        http_client=http_client,
                        manifest=manifest,
                        metadata=metadata,
                    )

            # Same identifying User-Agent as http_spider/browser_spider — without
            # it this client falls back to httpx's default UA, which WordPress-style
            # hotlink/bot protection on media paths (wp-content/uploads/...) 403s,
            # even though the same site's HTML pages crawled fine moments earlier.
            async with httpx.AsyncClient(
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
                timeout=self._cfg.get("requestTimeoutSeconds", 30),
                follow_redirects=True,
            ) as http_client:
                results = await asyncio.gather(
                    *(bounded_process(d) for d in crawl_result.files_discovered),
                    return_exceptions=True,
                )

            cancelled = any(isinstance(r, DownloadCancelled) for r in results)
            other_errors = [r for r in results if isinstance(r, BaseException) and not isinstance(r, DownloadCancelled)]

            if cancelled:
                log.info("collection_cancelled", run_id=self._run_db_id)
                await self._finalize(manifest, metadata, status="CANCELLED")
                return

            if other_errors:
                raise other_errors[0]

            await self._finalize(manifest, metadata, status="COMPLETED")

        except Exception as exc:
            log.error("collection_failed", run_id=self._run_db_id, error=str(exc))
            await self._pipeline.report_file_error(
                None, "UNKNOWN", f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            )
            await self._finalize(manifest, metadata, status="FAILED")
            raise
        finally:
            await self._pipeline.cleanup()

    async def _process_file(
        self,
        url: str,
        *,
        preferred_name: Optional[str] = None,
        http_client: httpx.AsyncClient,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
    ) -> None:
        """Download, hash, deduplicate, upload one file — with smart retry."""
        if await self._pipeline.skip_if_known_url(url, preferred_name or extract_filename(url), manifest):
            return

        max_retries = self._cfg.get("maxRetries", settings.default_max_retries)
        last_error: Exception | None = None

        for attempt in range(max_retries + 1):
            try:
                result = await download_file(
                    url,
                    client=http_client,
                    max_size_bytes=settings.max_file_size_bytes,
                    should_cancel=self._pipeline.is_cancelled,
                    preferred_name=preferred_name,
                )

                # Post-download verification: enforce allowedExtensions and reject unexpected HTML error pages
                allowed_extensions = self._cfg.get("allowedExtensions") or []
                normalized_allowed = [e.lower() if e.startswith(".") else f".{e.lower()}" for e in allowed_extensions if e.strip()]

                if (result.mime_type and "text/html" in result.mime_type) and (not normalized_allowed or ".html" not in normalized_allowed):
                    log.info("discarding_unexpected_html_download", url=url, mime=result.mime_type)
                    if os.path.exists(result.temp_path):
                        try:
                            os.unlink(result.temp_path)
                        except OSError:
                            pass
                    manifest.record_file_skipped()
                    return

                if normalized_allowed:
                    res_ext = (result.extension or "").lower()
                    mime = (result.mime_type or "").lower()
                    matches_ext = res_ext in normalized_allowed
                    matches_mime = (
                        (".pdf" in normalized_allowed and "application/pdf" in mime)
                        or (".epub" in normalized_allowed and "epub" in mime)
                        or (".docx" in normalized_allowed and "wordprocessingml" in mime)
                        or (".mp3" in normalized_allowed and "audio/" in mime)
                    )
                    if not matches_ext and not matches_mime:
                        log.info("discarding_unallowed_downloaded_extension", url=url, ext=res_ext, mime=mime, allowed=normalized_allowed)
                        if os.path.exists(result.temp_path):
                            try:
                                os.unlink(result.temp_path)
                            except OSError:
                                pass
                        manifest.record_file_skipped()
                        return

                await self._pipeline.process_downloaded_file(result, manifest=manifest, metadata=metadata)
                return

            except DownloadCancelled:
                raise

            except FileTooLargeError as e:
                log.warning("file_too_large", url=url, error=str(e))
                manifest.record_file_skipped()
                await self._pipeline.report_file_error(url, "FILE_TOO_LARGE", str(e))
                await self._pipeline.report_progress(manifest)
                return

            except DownloadError as e:
                last_error = e
                error_str = str(e)

                # Check if the error is retryable (network issues, 429, 5xx)
                is_retryable = any(
                    code_str in error_str
                    for code_str in ("401", "403", "429", "500", "502", "503", "504", "Timeout", "ConnectError", "ConnectionReset")
                )

                if not is_retryable or attempt >= max_retries:
                    log.warning("download_failed", url=url, error=error_str, attempt=attempt + 1)
                    manifest.record_file_failed()
                    await self._pipeline.report_file_error(url, "NETWORK_ERROR", error_str)
                    await self._pipeline.report_progress(manifest)
                    return

                # Exponential backoff with jitter: 2s, 4s, 8s...
                delay = (2 ** attempt) + random.uniform(0, 1)
                log.info(
                    "download_retry",
                    url=url,
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    delay_seconds=round(delay, 2),
                    error=error_str,
                )
                await asyncio.sleep(delay)

    async def _finalize(
        self,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
        *,
        status: str,
    ) -> None:
        """Upload metadata.jsonl and manifest.json, then update run status."""
        completed_at = datetime.now(timezone.utc)

        # Upload main root metadata.jsonl
        meta_path = metadata.finalize()
        try:
            storage.upload_file(meta_path, metadata.r2_key, "application/jsonl")
        except Exception as e:
            log.error("metadata_upload_failed", error=str(e))

        # Upload subfolder per-category metadata.jsonl files (e.g. pdf/native/decoded/metadata.jsonl)
        cat_files = metadata.finalize_categories()
        for cat_dir, (cat_path, cat_r2_key) in cat_files.items():
            try:
                storage.upload_file(cat_path, cat_r2_key, "application/jsonl")
                log.info("category_metadata_uploaded", category=cat_dir, r2_key=cat_r2_key)
            except Exception as e:
                log.error("category_metadata_upload_failed", category=cat_dir, error=str(e))

        metadata.cleanup()

        # Upload subfolder per-category manifest.json files (e.g. pdf/native/decoded/manifest.json)
        cat_manifests = manifest.build_category_manifests(status=status, completed_at=completed_at)
        for cat_name, (cat_bytes, cat_r2_key) in cat_manifests.items():
            try:
                storage.upload_bytes(cat_bytes, cat_r2_key, "application/json")
                log.info("category_manifest_uploaded", category=cat_name, r2_key=cat_r2_key)
            except Exception as e:
                log.error("category_manifest_upload_failed", category=cat_name, error=str(e))

        # Upload main root manifest.json
        manifest_bytes = manifest.to_json(status=status, completed_at=completed_at)
        try:
            storage.upload_bytes(manifest_bytes, manifest.r2_key, "application/json")
        except Exception as e:
            log.error("manifest_upload_failed", error=str(e))

        # Update run in database via API.
        # manifest.stats is snake_case to match the on-disk manifest.json
        # format — translate to the camelCase the API/Prisma schema expects.
        stats = manifest.stats
        await self._pipeline.update_run_status(
            status,
            completedAt=completed_at.isoformat(),
            manifestR2Key=manifest.r2_key,
            filesFound=stats["files_found"],
            filesDownloaded=stats["files_downloaded"],
            filesSkipped=stats["files_skipped"],
            filesDuplicate=stats["files_duplicate"],
            filesFailed=stats["files_failed"],
            pagesCrawled=stats["pages_crawled"],
        )

        log.info(
            "collection_completed",
            run_id=self._run_db_id,
            status=status,
            **stats,
        )
