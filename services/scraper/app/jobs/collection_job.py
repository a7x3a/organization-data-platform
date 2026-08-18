"""
Collection Job — orchestrates the full collection pipeline for one run.

Pipeline:
  1. Update run status → RUNNING
  2. Crawl (HTTP or Browser)
  3. For each discovered file:
     a. Check duplicate (source URL + SHA-256)
     b. Stream download + hash
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
from datetime import datetime, timezone
from typing import Any

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
from app.spiders.http_spider import crawl, CrawlConfig
from app.spiders.browser_spider import crawl_with_browser
from app.spiders.scrapling_spider import crawl_with_scrapling
from app.storage import storage
from app.storage.metadata_writer import MetadataWriter
from app.storage.manifest_writer import ManifestWriter

log = structlog.get_logger(__name__)


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

            use_browser = self._cfg.get("useBrowser", False)
            if use_scrapling:
                log.info("using_scrapling_spider", run_id=self._run_db_id, stealth=stealth_mode)
                crawl_result = await crawl_with_scrapling(
                    crawl_config,
                    should_cancel=self._pipeline.is_cancelled,
                    on_page_crawled=on_page_crawled,
                    on_file_found=on_file_found,
                )
            elif use_browser:
                log.info("using_playwright_browser", run_id=self._run_db_id)
                crawl_result = await crawl_with_browser(
                    crawl_config,
                    should_cancel=self._pipeline.is_cancelled,
                    on_page_crawled=on_page_crawled,
                    on_file_found=on_file_found,
                )
            else:
                crawl_result = await crawl(
                    crawl_config,
                    should_cancel=self._pipeline.is_cancelled,
                    on_page_crawled=on_page_crawled,
                    on_file_found=on_file_found,
                )
                # Smart Adaptive Crawling — if fast HTTP crawling finds 0 files on a dynamic/JS page,
                # the system automatically falls back to Playwright browser crawling.
                if not crawl_result.files_discovered and not crawl_result.cancelled:
                    is_canc = False
                    if self._pipeline.is_cancelled:
                        is_canc = await self._pipeline.is_cancelled()
                    if not is_canc:
                        log.info("http_crawl_found_0_files_attempting_browser_fallback", run_id=self._run_db_id)
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
                            log.warning("browser_fallback_failed", run_id=self._run_db_id, error=str(exc))

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
                    # Checked again here (not just at the top of run()) so a
                    # cancellation mid-run stops new downloads from starting
                    # as soon as a semaphore slot frees up, rather than only
                    # between whole crawl batches.
                    if await self._pipeline.wait_if_paused():
                        raise DownloadCancelled(f"Cancelled while paused: {discovered.url}")
                    if await self._pipeline.is_cancelled():
                        raise DownloadCancelled(f"Cancelled before starting {discovered.url}")
                    await self._process_file(
                        discovered.url,
                        http_client=http_client,
                        manifest=manifest,
                        metadata=metadata,
                    )

            # Same identifying User-Agent as http_spider/browser_spider — without
            # it this client falls back to httpx's default UA, which WordPress-style
            # hotlink/bot protection on media paths (wp-content/uploads/...) 403s,
            # even though the same site's HTML pages crawled fine moments earlier.
            async with httpx.AsyncClient(
                headers={"User-Agent": "ODP-Collector/1.0 (+https://github.com/org/data-platform)"},
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
            # Without this, a run that fails before/outside per-file error
            # reporting (a bad collector config, a crawl-phase crash) shows
            # up in the UI as "FAILED" with no visible reason at all — the
            # only trace was this container's own stdout log.
            await self._pipeline.report_file_error(
                None, "UNKNOWN", f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            )
            await self._finalize(manifest, metadata, status="FAILED")
            raise

    async def _process_file(
        self,
        url: str,
        *,
        http_client: httpx.AsyncClient,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
    ) -> None:
        """Download, hash, deduplicate, upload one file."""
        if await self._pipeline.skip_if_known_url(url, extract_filename(url), manifest):
            return

        try:
            result = await download_file(
                url,
                client=http_client,
                max_size_bytes=settings.max_file_size_bytes,
                should_cancel=self._pipeline.is_cancelled,
            )
        except DownloadCancelled:
            # Not a per-file failure — the whole run is being torn down.
            # Let it propagate so the caller stops immediately instead of
            # waiting for the next file-boundary cancellation check.
            raise
        except FileTooLargeError as e:
            log.warning("file_too_large", url=url, error=str(e))
            manifest.record_file_skipped()
            await self._pipeline.report_file_error(url, "FILE_TOO_LARGE", str(e))
            await self._pipeline.report_progress(manifest)
            return
        except DownloadError as e:
            log.warning("download_failed", url=url, error=str(e))
            manifest.record_file_failed()
            await self._pipeline.report_file_error(url, "NETWORK_ERROR", str(e))
            await self._pipeline.report_progress(manifest)
            return

        await self._pipeline.process_downloaded_file(result, manifest=manifest, metadata=metadata)

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

        # Upload manifest.json
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
