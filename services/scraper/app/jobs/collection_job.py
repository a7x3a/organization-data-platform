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
"""
import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from app.config.settings import settings
from app.downloader.downloader import (
    download_file,
    extract_filename,
    categorize_file,
    DownloadCancelled,
    DownloadError,
    FileTooLargeError,
)
from app.spiders.http_spider import crawl, CrawlConfig
from app.spiders.browser_spider import crawl_with_browser
from app.storage import storage
from app.storage.metadata_writer import MetadataWriter
from app.storage.manifest_writer import ManifestWriter

log = structlog.get_logger(__name__)


class CollectionJob:
    """
    Executes one collection run end-to-end.

    job_data keys (from BullMQ):
        run_id          — CollectionRun database ID
        collector_id
        source_id
        source_slug
        configuration   — CollectorConfiguration dict
        run_folder_key  — R2 prefix: 00_raw/web/{slug}/{run_id}
    """

    def __init__(self, job_data: dict[str, Any], api_client: httpx.AsyncClient) -> None:
        self._data = job_data
        self._api = api_client
        self._run_db_id: str = job_data["runId"]
        self._cfg: dict = job_data["configuration"]
        self._run_folder_key: str = job_data["runFolderKey"]
        self._source_slug: str = job_data["sourceSlug"]
        self._cancelled = False

    async def run(self) -> None:
        started_at = datetime.now(timezone.utc)
        log.info(
            "collection_started",
            run_id=self._run_db_id,
            source=self._source_slug,
        )

        await self._update_run_status("RUNNING", startedAt=started_at.isoformat())

        manifest = ManifestWriter(
            run_id=self._run_db_id,
            source_name=self._source_slug,
            run_folder_key=self._run_folder_key,
            collector_version=self._data.get("collectorVersion", "1.0.0"),
            started_at=started_at,
        )
        metadata = MetadataWriter(self._run_folder_key, self._source_slug)

        try:
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
            )

            use_browser = self._cfg.get("useBrowser", False)
            if use_browser:
                log.info("using_playwright_browser", run_id=self._run_db_id)
                crawl_result = await crawl_with_browser(crawl_config, should_cancel=self._is_cancelled)
            else:
                crawl_result = await crawl(crawl_config, should_cancel=self._is_cancelled)

            for _ in range(crawl_result.pages_crawled):
                manifest.record_page_crawled()

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
                    if await self._is_cancelled():
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
        if await self._is_known_url(url):
            # Cheap pre-check: this exact URL was already collected (or
            # already resolved as a duplicate) in a previous run. Skip the
            # full download entirely — re-fetching tens of megabytes of an
            # mp3/pdf against a slow, possibly-throttled real site just to
            # recompute an already-known hash is pure waste. Content-hash
            # dedup below still runs for any URL not seen before, so a
            # renamed/moved copy of the same content is still caught.
            log.info("skipped_known_url", url=url)
            manifest.record_file_duplicate()
            await self._report_file_status(url, extract_filename(url), "", "DUPLICATE")
            await self._report_progress(manifest)
            return

        try:
            result = await download_file(
                url,
                client=http_client,
                max_size_bytes=settings.max_file_size_bytes,
                should_cancel=self._is_cancelled,
            )
        except DownloadCancelled:
            # Not a per-file failure — the whole run is being torn down.
            # Let it propagate so the caller stops immediately instead of
            # waiting for the next file-boundary cancellation check.
            raise
        except FileTooLargeError as e:
            log.warning("file_too_large", url=url, error=str(e))
            manifest.record_file_skipped()
            await self._report_file_error(url, "FILE_TOO_LARGE", str(e))
            await self._report_progress(manifest)
            return
        except DownloadError as e:
            log.warning("download_failed", url=url, error=str(e))
            manifest.record_file_failed()
            await self._report_file_error(url, "NETWORK_ERROR", str(e))
            await self._report_progress(manifest)
            return

        # Check for exact duplicate via SHA-256
        is_dup = await self._is_duplicate(result.sha256)
        if is_dup:
            log.info("duplicate_detected", url=url, sha256=result.sha256)
            manifest.record_file_duplicate()
            os.unlink(result.temp_path)
            await self._report_file_status(url, result.file_name, result.sha256, "DUPLICATE")
            await self._report_progress(manifest)
            return

        # Build R2 key — one subfolder per file type (pdf/audio/video/images/
        # documents/...) so 00_raw doesn't become a single bucket mixing
        # every format together.
        category = categorize_file(result.mime_type, result.extension)
        r2_key = f"{self._run_folder_key}/{category}/{result.file_name}"

        # Upload to R2
        try:
            storage.upload_file(
                result.temp_path,
                r2_key,
                content_type=result.mime_type,
            )
        except Exception as e:
            log.error("r2_upload_failed", url=url, key=r2_key, error=str(e))
            manifest.record_file_failed()
            await self._report_file_error(url, "R2_UPLOAD_ERROR", str(e))
            await self._report_progress(manifest)
            os.unlink(result.temp_path)
            return
        finally:
            # Always clean up temp file
            try:
                os.unlink(result.temp_path)
            except FileNotFoundError:
                pass

        # Reserve a file_id from the API
        file_id = await self._reserve_file_id(
            sourceUrl=url,
            finalUrl=result.final_url,
            fileName=result.file_name,
            extension=result.extension,
            mimeType=result.mime_type,
            fileSize=result.file_size,
            sha256=result.sha256,
            r2Key=r2_key,
        )

        metadata.add(
            file_id=file_id,
            file_name=result.file_name,
            file_type=result.extension or "",
            mime_type=result.mime_type,
            file_size=result.file_size,
            sha256=result.sha256,
            source_url=url,
            final_url=result.final_url,
            r2_key=r2_key,
        )

        manifest.record_file_downloaded()
        log.info("file_collected", url=url, sha256=result.sha256, r2_key=r2_key)
        await self._report_progress(manifest)

    async def _finalize(
        self,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
        *,
        status: str,
    ) -> None:
        """Upload metadata.jsonl and manifest.json, then update run status."""
        completed_at = datetime.now(timezone.utc)

        # Upload metadata.jsonl
        meta_path = metadata.finalize()
        try:
            storage.upload_file(meta_path, metadata.r2_key, "application/jsonl")
        except Exception as e:
            log.error("metadata_upload_failed", error=str(e))
        finally:
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
        await self._update_run_status(
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

    async def _report_progress(self, manifest: ManifestWriter) -> None:
        """
        Push incremental stats after each file, not just at the end.
        Without this the Runs table shows 0/0/0 for the run's entire
        duration — filesFound/filesDownloaded/etc only ever got written
        once, in _finalize() — so an actively-working run looked frozen.
        """
        # manifest.stats is snake_case to match the on-disk manifest.json
        # format — translate to the camelCase the API/Prisma schema expects
        # (same translation _finalize does for the terminal update).
        stats = manifest.stats
        await self._update_run_status(
            "RUNNING",
            filesFound=stats["files_found"],
            filesDownloaded=stats["files_downloaded"],
            filesSkipped=stats["files_skipped"],
            filesDuplicate=stats["files_duplicate"],
            filesFailed=stats["files_failed"],
            pagesCrawled=stats["pages_crawled"],
        )

    async def _update_run_status(self, status: str, **kwargs) -> None:
        """Callback to API to update run status."""
        try:
            await self._api.patch(
                f"/api/runs/{self._run_db_id}/status",
                json={"status": status, **kwargs},
            )
        except Exception as e:
            log.error("run_status_update_failed", run_id=self._run_db_id, error=str(e))

    async def _is_cancelled(self) -> bool:
        """Check if the run has been marked for cancellation."""
        try:
            r = await self._api.get(f"/api/runs/{self._run_db_id}")
            data = r.json()
            return data.get("status") == "CANCEL_REQUESTED"
        except Exception:
            return False

    async def _is_duplicate(self, sha256: str) -> bool:
        """Ask the API if this SHA-256 already exists."""
        try:
            r = await self._api.get(f"/api/files?sha256={sha256}&pageSize=1")
            data = r.json()
            return data.get("total", 0) > 0
        except Exception:
            return False

    async def _is_known_url(self, url: str) -> bool:
        """
        Ask the API if this exact source URL was already recorded for this
        source (as UPLOADED or DUPLICATE) — a cheap metadata check, done
        before spending a full download on a file we already have a
        definitive answer for.
        """
        try:
            r = await self._api.get(
                "/api/files",
                params={"sourceId": self._data["sourceId"], "sourceUrl": url, "pageSize": 1},
            )
            data = r.json()
            return data.get("total", 0) > 0
        except Exception:
            return False

    async def _reserve_file_id(self, **kwargs) -> str:
        """Create a CollectedFile record via API and return its file_id."""
        try:
            r = await self._api.post(
                f"/api/runs/{self._run_db_id}/files",
                json={
                    "collectionRunId": self._run_db_id,
                    "sourceId": self._data["sourceId"],
                    "status": "UPLOADED",
                    **kwargs,
                },
            )
            return r.json().get("fileId", "RAW-UNKNOWN")
        except Exception as e:
            log.error("file_id_reservation_failed", error=str(e))
            return "RAW-UNKNOWN"

    async def _report_file_error(self, url: str, code: str, message: str) -> None:
        try:
            await self._api.post(
                f"/api/runs/{self._run_db_id}/errors",
                json={"url": url, "errorCode": code, "message": message},
            )
        except Exception:
            pass

    async def _report_file_status(
        self, url: str, file_name: str, sha256: str, status: str
    ) -> None:
        try:
            await self._api.post(
                f"/api/runs/{self._run_db_id}/files",
                json={
                    "collectionRunId": self._run_db_id,
                    "sourceId": self._data["sourceId"],
                    "sourceUrl": url,
                    "fileName": file_name,
                    "sha256": sha256,
                    "status": status,
                },
            )
        except Exception:
            pass
