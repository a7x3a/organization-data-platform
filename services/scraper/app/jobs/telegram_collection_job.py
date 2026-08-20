"""
Telegram Collection Job — orchestrates one TELEGRAM collector run end-to-end.

Mirrors CollectionJob's run()/_finalize() shape (status transitions,
manifest/metadata writers, cancellation checks) but drives Telegram message
scraping instead of an HTTP/browser crawl. The dedup/upload/record tail is
the exact same FilePipeline the web collector uses — only discovery and the
download mechanics differ between collector types.
"""
import os
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from app.pipeline.file_pipeline import FilePipeline
from app.storage import storage
from app.storage.manifest_writer import ManifestWriter
from app.storage.metadata_writer import MetadataWriter
from app.telegram.client import build_client, TelegramNotConfiguredError
from app.telegram.scraper import scrape_channel, TelegramCollectorConfig

log = structlog.get_logger(__name__)


class TelegramCollectionJob:
    """
    job_data keys (from BullMQ), mirroring CollectionJob:
        runId           — CollectionRun database ID
        sourceId
        sourceSlug
        configuration   — { channels, messageLimit, sinceDate, downloadMedia, includeMediaTypes }
        runFolderKey    — R2 prefix: 00_raw/telegram/{slug}/{run_id}
    """

    def __init__(self, job_data: dict[str, Any], api_client: httpx.AsyncClient) -> None:
        self._data = job_data
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
            "telegram_collection_started",
            run_id=self._run_db_id,
            source=self._source_slug,
        )

        if await self._pipeline.is_cancelled():
            log.info("telegram_cancelled_before_start", run_id=self._run_db_id)
            manifest = ManifestWriter(
                run_id=self._run_db_id,
                source_name=self._source_slug,
                run_folder_key=self._run_folder_key,
                collector_version=self._data.get("collectorVersion", "1.0.0"),
                started_at=started_at,
                source_type="telegram",
            )
            metadata = MetadataWriter(self._run_folder_key, self._source_slug, source_type="telegram")
            await self._finalize(manifest, metadata, status="CANCELLED")
            return

        await self._pipeline.update_run_status("RUNNING", startedAt=started_at.isoformat())

        manifest = ManifestWriter(
            run_id=self._run_db_id,
            source_name=self._source_slug,
            run_folder_key=self._run_folder_key,
            collector_version=self._data.get("collectorVersion", "1.0.0"),
            started_at=started_at,
            source_type="telegram",
        )
        metadata = MetadataWriter(self._run_folder_key, self._source_slug, source_type="telegram")

        try:
            channels: list[str] = self._cfg.get("channels", [])
            telegram_cfg = TelegramCollectorConfig(
                channels=channels,
                message_limit=self._cfg.get("messageLimit", 500),
                since_date=self._cfg.get("sinceDate"),
                download_media=self._cfg.get("downloadMedia", True),
                include_media_types=self._cfg.get("includeMediaTypes") or None,
                allowed_extensions=self._cfg.get("allowedExtensions") or None,
                save_message_json=self._cfg.get("saveMessageJson", False),
            )
            log.info(
                "telegram_job_config_parsed",
                channels=channels,
                include_media_types=telegram_cfg.include_media_types,
                allowed_extensions=telegram_cfg.allowed_extensions,
                download_media=telegram_cfg.download_media,
                save_message_json=telegram_cfg.save_message_json,
            )

            try:
                telegram_creds = self._data.get("telegramCredentials")
                client = build_client(telegram_creds)
            except TelegramNotConfiguredError as exc:
                log.error("telegram_not_configured", error=str(exc))
                await self._pipeline.report_file_error(None, "UNKNOWN", str(exc))
                await self._finalize(manifest, metadata, status="FAILED")
                return

            await client.connect()
            try:
                if not await client.is_user_authorized():
                    message = (
                        "Telegram session is not authorized — the user session is missing, "
                        "expired, or was revoked. Please verify and authenticate your Telegram account."
                    )
                    log.error("telegram_session_not_authorized", run_id=self._run_db_id)
                    await self._pipeline.report_file_error(None, "UNKNOWN", message)
                    await self._finalize(manifest, metadata, status="FAILED")
                    return

                for channel in channels:
                    if await self._pipeline.wait_if_paused():
                        break
                    if await self._pipeline.is_cancelled():
                        break

                    # One "page" per channel — gives the run's progress
                    # reporting the same non-zero "activity happened" signal
                    # a web run gets from pages_crawled, since Telegram has
                    # no analogous concept of a page.
                    manifest.record_page_crawled()

                    async for result in scrape_channel(
                        client,
                        channel,
                        telegram_cfg,
                        should_cancel=self._pipeline.is_cancelled,
                    ):
                        if await self._pipeline.wait_if_paused():
                            break
                        if await self._pipeline.skip_if_known_url(
                            result.source_url, result.file_name, manifest
                        ):
                            try:
                                os.unlink(result.temp_path)
                            except FileNotFoundError:
                                pass
                            continue
                        await self._pipeline.process_downloaded_file(
                            result, manifest=manifest, metadata=metadata
                        )
            finally:
                res = client.disconnect()
                if res is not None:
                    await res

            if await self._pipeline.is_cancelled():
                log.info("telegram_collection_cancelled", run_id=self._run_db_id)
                await self._finalize(manifest, metadata, status="CANCELLED")
                return

            await self._finalize(manifest, metadata, status="COMPLETED")

        except Exception as exc:
            log.error("telegram_collection_failed", run_id=self._run_db_id, error=str(exc))
            await self._pipeline.report_file_error(
                None, "UNKNOWN", f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            )
            await self._finalize(manifest, metadata, status="FAILED")
        finally:
            await self._pipeline.cleanup()

    async def _finalize(
        self,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
        *,
        status: str,
    ) -> None:
        """Upload metadata.jsonl, category metadata/manifests, and manifest.json, then update run status."""
        completed_at = datetime.now(timezone.utc)

        # Upload main root metadata.jsonl
        meta_path = metadata.finalize()
        try:
            storage.upload_file(meta_path, metadata.r2_key, "application/jsonl")
        except Exception as e:
            log.error("metadata_upload_failed", error=str(e))

        # Upload subfolder per-category metadata.jsonl files
        cat_files = metadata.finalize_categories()
        for cat_dir, (cat_path, cat_r2_key) in cat_files.items():
            try:
                storage.upload_file(cat_path, cat_r2_key, "application/jsonl")
                log.info("category_metadata_uploaded", category=cat_dir, r2_key=cat_r2_key)
            except Exception as e:
                log.error("category_metadata_upload_failed", category=cat_dir, error=str(e))

        metadata.cleanup()

        # Upload subfolder per-category manifest.json files
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
            "telegram_collection_completed",
            run_id=self._run_db_id,
            status=status,
            **stats,
        )
