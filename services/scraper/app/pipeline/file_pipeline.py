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

import os
from typing import Any, Optional

import httpx
import structlog

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

            category = categorize_file(result.mime_type, result.extension)
            r2_key = f"{self._run_folder_key}/{category}/{result.file_name}"

            try:
                storage.upload_file(result.temp_path, r2_key, content_type=result.mime_type)
            except Exception as e:
                log.error(
                    "r2_upload_failed", url=result.source_url, key=r2_key, error=str(e)
                )
                manifest.record_file_failed()
                await self.report_file_error(result.source_url, "R2_UPLOAD_ERROR", str(e))
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
            )

            manifest.record_file_downloaded()
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
        """Check if the run has been marked for cancellation."""
        try:
            r = await self._api.get(f"/api/runs/{self._run_db_id}")
            data = r.json()
            return data.get("status") == "CANCEL_REQUESTED"
        except Exception:
            return False

    async def is_duplicate(self, sha256: str) -> bool:
        """Ask the API if this SHA-256 already exists."""
        try:
            r = await self._api.get(f"/api/files?sha256={sha256}&pageSize=1")
            data = r.json()
            return data.get("total", 0) > 0
        except Exception:
            return False

    async def is_known_url(self, url: str) -> bool:
        """
        Ask the API if this exact source URL was already recorded for this
        source (as UPLOADED or DUPLICATE).
        """
        try:
            r = await self._api.get(
                "/api/files",
                params={"sourceId": self._source_id, "sourceUrl": url, "pageSize": 1},
            )
            data = r.json()
            return data.get("total", 0) > 0
        except Exception:
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
