"""
Shared collection pipeline: dedup, R2 upload, and metadata/progress
reporting for one collection run — used by both the web collector
(CollectionJob) and the Telegram collector (TelegramCollectionJob).

Both collectors discover artifacts through completely different mechanisms
(HTTP crawling vs Telegram message iteration), but once an artifact is a
downloaded local file with a computed SHA-256, everything downstream — "have
we seen this exact URL before", "have we seen this exact content before",
"upload to R2", "record file_id/metadata", "report run progress" — is
identical. This class is that shared tail, extracted out of what used to be
CollectionJob._process_file so TelegramCollectionJob doesn't have to
reimplement (and risk drifting from) the same dedup/upload/record logic.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Optional

import httpx
import redis.asyncio as aioredis
import structlog

from app.config.settings import settings
from app.downloader.downloader import DownloadResult, categorize_file
from app.storage import storage
from app.storage.manifest_writer import ManifestWriter
from app.storage.metadata_writer import MetadataWriter

log = structlog.get_logger(__name__)


class FilePipeline:
    """One instance per collection run (web or Telegram)."""

    def __init__(
        self,
        *,
        api_client: httpx.AsyncClient,
        run_db_id: str,
        source_id: str,
        run_folder_key: str,
    ) -> None:
        self._api = api_client
        self._run_db_id = run_db_id
        self._source_id = source_id
        self._run_folder_key = run_folder_key
        self._redis_pool: Optional[aioredis.ConnectionPool] = None
        self._cancelled: bool = False
        self._last_cancelled_check: float = 0.0

    def _get_redis_pool(self) -> aioredis.ConnectionPool:
        if self._redis_pool is None:
            self._redis_pool = aioredis.ConnectionPool.from_url(
                settings.redis_url, decode_responses=False
            )
        return self._redis_pool

    async def cleanup(self) -> None:
        if self._redis_pool is not None:
            await self._redis_pool.aclose()
            self._redis_pool = None

    # ─── Pre-download check ────────────────────────────────────

    async def skip_if_known_url(
        self, url: str, file_name: str, manifest: ManifestWriter
    ) -> bool:
        """
        True (and already recorded as a duplicate) if this exact URL was
        already collected in a previous run for this source — checked
        *before* downloading, so a renamed-but-already-seen URL doesn't cost
        a full re-download just to recompute an already-known hash. Content
        dedup below (by SHA-256) still runs for any URL not seen before, so
        a moved/renamed copy of the same content is still caught.
        """
        if not await self.is_known_url(url):
            return False
        log.info("skipped_known_url", url=url)
        manifest.record_file_duplicate()
        await self.report_file_status(url, file_name, "", "DUPLICATE")
        await self.report_progress(manifest)
        return True

    # ─── Post-download pipeline ────────────────────────────────

    async def process_downloaded_file(
        self,
        result: DownloadResult,
        *,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
    ) -> None:
        """
        Dedup by content hash, upload to R2, record metadata, and report run
        progress for one already-downloaded artifact. Always cleans up
        result.temp_path itself, on every path — callers only need to clean
        up temp files on a failed *download* (before this is ever called).
        """
        try:
            if await self.is_cancelled():
                log.info("processing_skipped_run_cancelled", url=result.source_url)
                return

            if await self.is_duplicate(result.sha256):
                log.info(
                    "duplicate_detected", url=result.source_url, sha256=result.sha256
                )
                manifest.record_file_duplicate()
                await self.report_file_status(
                    result.source_url, result.file_name, result.sha256, "DUPLICATE"
                )
                await self.report_progress(manifest)
                return

            extra_metadata = {}
            is_pdf = (result.mime_type == "application/pdf") or (
                result.extension and result.extension.lower() == ".pdf"
            )

            # Extract text for analysis
            extracted_text = ""
            if is_pdf and os.path.exists(result.temp_path):
                from app.media.pdf_processor import extract_and_classify_pdf

                pdf_res = extract_and_classify_pdf(result.temp_path)
                extra_metadata["pdf_extraction"] = pdf_res.to_dict()
                category = pdf_res.folder_path
                extracted_text = pdf_res.text_content if hasattr(pdf_res, "text_content") else ""
            else:
                category = categorize_file(result.mime_type, result.extension, temp_path=result.temp_path)

            # Data Intelligence: language detection, quality scoring, Kurdish categorization
            if os.path.exists(result.temp_path):
                try:
                    from app.media.language_detector import detect_language, extract_text_from_file
                    from app.media.quality_scorer import score_quality
                    from app.media.kurdish_categorizer import categorize_content

                    # Extract text if not already done (non-PDF files)
                    if not extracted_text:
                        extracted_text = extract_text_from_file(result.temp_path, result.mime_type)

                    # Language detection
                    if extracted_text:
                        lang_result = detect_language(extracted_text)
                        extra_metadata["language"] = lang_result.to_dict()

                    # Quality scoring
                    quality_result = score_quality(
                        result.temp_path,
                        text_content=extracted_text,
                        mime_type=result.mime_type,
                        metadata=extra_metadata,
                    )
                    extra_metadata["quality"] = quality_result.to_dict()

                    # Kurdish content categorization
                    if extracted_text:
                        cat_result = categorize_content(extracted_text, extra_metadata)
                        extra_metadata["kurdish_category"] = cat_result.to_dict()

                except Exception as e:
                    log.warning("data_intelligence_failed", url=result.source_url, error=str(e))

            r2_key = f"{self._run_folder_key}/{category}/{result.file_name}"

            try:
                storage.upload_file(result.temp_path, r2_key, content_type=result.mime_type)
            except Exception as e:
                log.error(
                    "storage_upload_failed", url=result.source_url, key=r2_key, error=str(e)
                )
                manifest.record_file_failed()
                err_code = "R2_UPLOAD_ERROR" if settings.storage_provider == "r2" else "STORAGE_ERROR"
                await self.report_file_error(result.source_url, err_code, str(e))
                await self.report_progress(manifest)
                return

            file_id = await self.reserve_file_id(
                sourceUrl=result.source_url,
                finalUrl=result.final_url,
                fileName=result.file_name,
                extension=result.extension,
                mimeType=result.mime_type,
                fileSize=result.file_size,
                sha256=result.sha256,
                r2Key=r2_key,
                metadata=extra_metadata,
            )

            metadata.add(
                file_id=file_id,
                file_name=result.file_name,
                file_type=result.extension or "",
                mime_type=result.mime_type,
                file_size=result.file_size,
                sha256=result.sha256,
                source_url=result.source_url,
                final_url=result.final_url,
                r2_key=r2_key,
                extra_metadata=extra_metadata,
            )

            manifest.record_file_downloaded(
                category=category,
                file_name=result.file_name,
                file_size=result.file_size,
            )
            log.info(
                "file_collected",
                url=result.source_url,
                sha256=result.sha256,
                r2_key=r2_key,
            )
            await self.report_progress(manifest)
        finally:
            try:
                os.unlink(result.temp_path)
            except FileNotFoundError:
                pass

    # ─── API callbacks ──────────────────────────────────────────

    async def update_run_status(self, status: str, **kwargs: Any) -> None:
        """Callback to API to update run status."""
        try:
            await self._api.patch(
                f"/api/runs/{self._run_db_id}/status",
                json={"status": status, **kwargs},
            )
        except Exception as e:
            log.error("run_status_update_failed", run_id=self._run_db_id, error=str(e))

    async def is_cancelled(self) -> bool:
        if self._cancelled:
            return True

        now = asyncio.get_event_loop().time()
        if now - self._last_cancelled_check < 0.5:
            return self._cancelled

        self._last_cancelled_check = now

        try:
            async with aioredis.Redis(connection_pool=self._get_redis_pool()) as r:
                val = await r.get(f"cancel_run:{self._run_db_id}")
                if val:
                    self._cancelled = True
                    return True
        except Exception:
            pass

        try:
            resp = await self._api.get(f"/api/runs/{self._run_db_id}")
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")
            if status in ("CANCEL_REQUESTED", "CANCELLED"):
                self._cancelled = True
                return True
            return False
        except Exception as e:
            log.warning("cancellation_check_failed", run_id=self._run_db_id, error=str(e))
            return False

    async def wait_if_paused(self) -> bool:
        """
        Check if the run is currently in PAUSED status (via Redis or API status).
        If paused, wait in a sleep loop until resumed or cancelled.
        Returns True if cancelled while waiting.
        """
        try:
            async with aioredis.Redis(connection_pool=self._get_redis_pool()) as r:
                while True:
                    if await self.is_cancelled():
                        return True

                    val = await r.get(f"pause_run:{self._run_db_id}")
                    if not val:
                        # Also check API status as fallback
                        res = await self._api.get(f"/api/runs/{self._run_db_id}")
                        if res.status_code == 200:
                            st = res.json().get("status")
                            if st != "PAUSED":
                                break
                        else:
                            break

                    log.info("collection_run_paused_waiting", run_id=self._run_db_id)
                    await asyncio.sleep(2)
        except Exception as e:
            log.warning("pause_check_error", run_id=self._run_db_id, error=str(e))

        return False

    async def is_duplicate(self, sha256: str) -> bool:
        """Ask the API if this SHA-256 already exists and is actively stored."""
        try:
            r = await self._api.get(f"/api/files?sha256={sha256}&status=UPLOADED&pageSize=1")
            r.raise_for_status()
            data = r.json()
            return data.get("total", 0) > 0
        except Exception as e:
            log.warning("duplicate_check_failed", sha256=sha256, error=str(e))
            return False

    async def is_known_url(self, url: str) -> bool:
        """
        Ask the API if this exact source URL was already recorded for this
        source as UPLOADED.
        """
        try:
            r = await self._api.get(
                "/api/files",
                params={"sourceId": self._source_id, "sourceUrl": url, "status": "UPLOADED", "pageSize": 1},
            )
            r.raise_for_status()
            data = r.json()
            return data.get("total", 0) > 0
        except Exception as e:
            log.warning("known_url_check_failed", url=url, error=str(e))
            return False

    async def reserve_file_id(self, **kwargs: Any) -> str:
        """Create a CollectedFile record via API and return its file_id."""
        try:
            r = await self._api.post(
                f"/api/runs/{self._run_db_id}/files",
                json={
                    "collectionRunId": self._run_db_id,
                    "sourceId": self._source_id,
                    "status": "UPLOADED",
                    **kwargs,
                },
            )
            return r.json().get("fileId", "RAW-UNKNOWN")
        except Exception as e:
            log.error("file_id_reservation_failed", error=str(e))
            return "RAW-UNKNOWN"

    async def report_file_error(self, url: Optional[str], code: str, message: str) -> None:
        """
        Record a run-level or file-level error, visible on the run's detail
        page. `url` is optional — job-level failures (bad Telegram
        credentials, an uncaught exception before any file was ever
        discovered) have no single file to attribute the error to. The key
        is omitted entirely rather than sent as `null`, since the API's
        Zod schema (`url: z.string().optional()`) accepts a missing key but
        rejects a literal null.
        """
        payload: dict[str, Any] = {"errorCode": code, "message": message}
        if url:
            payload["url"] = url
        try:
            await self._api.post(f"/api/runs/{self._run_db_id}/errors", json=payload)
        except Exception:
            pass

    async def report_file_status(
        self, url: str, file_name: str, sha256: str, status: str
    ) -> None:
        try:
            await self._api.post(
                f"/api/runs/{self._run_db_id}/files",
                json={
                    "collectionRunId": self._run_db_id,
                    "sourceId": self._source_id,
                    "sourceUrl": url,
                    "fileName": file_name,
                    "sha256": sha256,
                    "status": status,
                },
            )
        except Exception:
            pass

    async def report_progress(self, manifest: ManifestWriter) -> None:
        """
        Push incremental stats after each file, not just at the end — a
        run's Runs-table row would otherwise show 0/0/0 for its entire
        duration.
        """
        stats = manifest.stats
        await self.update_run_status(
            "RUNNING",
            filesFound=stats["files_found"],
            filesDownloaded=stats["files_downloaded"],
            filesSkipped=stats["files_skipped"],
            filesDuplicate=stats["files_duplicate"],
            filesFailed=stats["files_failed"],
            pagesCrawled=stats["pages_crawled"],
        )
