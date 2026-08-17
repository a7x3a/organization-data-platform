"""
Media Collection Job — orchestrates YouTube, video, audio, local file download,
audio chunking, Google Gemini transcription, and STT/TTS dataset generation.

Uploads original audio, audio chunks, transcripts, and JSONL datasets to R2/storage
with clean sanitized key structures and updates metadata & run status via API.
"""
import asyncio
import os
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
import structlog

from app.config.settings import settings
from app.media.chunker import AudioChunker
from app.media.dataset_builder import DatasetBuilder
from app.media.downloader import MediaDownloader
from app.media.gemini_transcriber import GeminiTranscriber
from app.pipeline.file_pipeline import FilePipeline
from app.storage import storage
from app.storage.manifest_writer import ManifestWriter
from app.storage.metadata_writer import MetadataWriter

log = structlog.get_logger(__name__)


def _compute_sha256(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(64 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()


class MediaCollectionJob:
    """
    Executes a MEDIA / YouTube / Voice transcription run end-to-end.
    """

    def __init__(self, job_data: Dict[str, Any], api_client: httpx.AsyncClient) -> None:
        self._data = job_data
        self._api = api_client
        self._run_db_id: str = job_data["runId"]
        self._cfg: Dict[str, Any] = job_data.get("configuration", {})
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
        log.info("media_job_started", run_id=self._run_db_id, source=self._source_slug)

        if await self._pipeline.is_cancelled():
            log.info("media_cancelled_before_start", run_id=self._run_db_id)
            manifest = ManifestWriter(
                run_id=self._run_db_id,
                source_name=self._source_slug,
                run_folder_key=self._run_folder_key,
                collector_version=self._data.get("collectorVersion", "1.0.0"),
                started_at=started_at,
                source_type="media",
            )
            metadata = MetadataWriter(self._run_folder_key, self._source_slug, source_type="media")
            await self._finalize(manifest, metadata, status="CANCELLED")
            return

        await self._pipeline.update_run_status("RUNNING", startedAt=started_at.isoformat())

        manifest = ManifestWriter(
            run_id=self._run_db_id,
            source_name=self._source_slug,
            run_folder_key=self._run_folder_key,
            collector_version=self._data.get("collectorVersion", "1.0.0"),
            started_at=started_at,
            source_type="media",
        )
        metadata = MetadataWriter(self._run_folder_key, self._source_slug, source_type="media")

        try:
            # Determine target media URL or local path
            target_url = (
                self._cfg.get("mediaUrl")
                or (self._cfg.get("startUrls", [None])[0])
                or self._cfg.get("localPath")
            )
            if not target_url:
                raise ValueError("No target mediaUrl, startUrl, or localPath specified in job configuration.")

            # 1. Download Media
            downloader = MediaDownloader()
            media_info = await downloader.download(target_url)
            log.info("media_downloaded", title=media_info.title, path=media_info.local_path)

            orig_filename = os.path.basename(media_info.local_path)
            orig_sha256 = _compute_sha256(media_info.local_path)
            orig_size = os.path.getsize(media_info.local_path)
            orig_r2_key = f"{self._run_folder_key}/audio/original/{orig_filename}"

            storage.upload_file(media_info.local_path, orig_r2_key, content_type=media_info.mime_type)
            orig_file_id = await self._pipeline.reserve_file_id(
                sourceUrl=media_info.source_url,
                fileName=orig_filename,
                sha256=orig_sha256,
                fileSize=orig_size,
                mimeType=media_info.mime_type,
                r2Key=orig_r2_key,
            )
            metadata.add(
                file_id=orig_file_id,
                file_name=orig_filename,
                file_type=os.path.splitext(orig_filename)[1],
                mime_type=media_info.mime_type,
                file_size=orig_size,
                sha256=orig_sha256,
                source_url=media_info.source_url,
                final_url=media_info.source_url,
                r2_key=orig_r2_key,
            )
            manifest.record_file_downloaded()

            # 2. Chunk Audio
            chunk_seconds = self._cfg.get("audioChunkSeconds", settings.audio_chunk_seconds)
            chunker = AudioChunker(chunk_seconds=chunk_seconds)
            chunks = chunker.split_media(media_info.local_path)
            log.info("media_chunked", total_chunks=len(chunks))

            for chunk in chunks:
                chunk_filename = os.path.basename(chunk.file_path)
                chunk_sha = _compute_sha256(chunk.file_path)
                chunk_sz = os.path.getsize(chunk.file_path)
                chunk_ext = os.path.splitext(chunk_filename)[1].lower()
                chunk_mime = "audio/wav" if chunk_ext == ".wav" else "audio/mp3"
                chunk_r2_key = f"{self._run_folder_key}/audio/chunks/{chunk_filename}"

                storage.upload_file(chunk.file_path, chunk_r2_key, content_type=chunk_mime)
                c_file_id = await self._pipeline.reserve_file_id(
                    sourceUrl=media_info.source_url,
                    fileName=chunk_filename,
                    sha256=chunk_sha,
                    fileSize=chunk_sz,
                    mimeType=chunk_mime,
                    r2Key=chunk_r2_key,
                )
                metadata.add(
                    file_id=c_file_id,
                    file_name=chunk_filename,
                    file_type=chunk_ext,
                    mime_type=chunk_mime,
                    file_size=chunk_sz,
                    sha256=chunk_sha,
                    source_url=media_info.source_url,
                    final_url=media_info.source_url,
                    r2_key=chunk_r2_key,
                    extra_metadata={"start_seconds": chunk.start_seconds, "end_seconds": chunk.end_seconds},
                )
                manifest.record_file_downloaded()

            # 3. Transcribe Chunks via Gemini API
            transcriber = GeminiTranscriber(
                api_key=self._cfg.get("geminiApiKey", settings.gemini_api_key),
                model_name=self._cfg.get("geminiModel", settings.gemini_model),
            )
            transcriptions = []
            for chunk in chunks:
                transcription = await transcriber.transcribe_chunk(chunk)
                transcriptions.append(transcription)

            # 4. Build STT and TTS Datasets
            output_dir = os.path.join(settings.temp_dir, f"dataset_{self._run_db_id}")
            dataset_builder = DatasetBuilder(output_dir=output_dir)
            dataset_paths = dataset_builder.build_dataset(media_info, transcriptions)

            # Upload STT, TTS datasets and full transcript to R2
            dataset_r2_keys = {
                "stt_dataset": f"{self._run_folder_key}/datasets/stt_dataset.jsonl",
                "tts_dataset": f"{self._run_folder_key}/datasets/tts_dataset.jsonl",
                "full_transcript": f"{self._run_folder_key}/transcripts/full_transcript.txt",
            }

            for key_name, file_path in dataset_paths.items():
                if os.path.exists(file_path):
                    r2_key = dataset_r2_keys.get(key_name, f"{self._run_folder_key}/datasets/{os.path.basename(file_path)}")
                    content_type = "text/plain" if file_path.endswith(".txt") else "application/jsonl"
                    storage.upload_file(file_path, r2_key, content_type=content_type)
                    d_sha = _compute_sha256(file_path)
                    d_sz = os.path.getsize(file_path)

                    df_id = await self._pipeline.reserve_file_id(
                        sourceUrl=media_info.source_url,
                        fileName=os.path.basename(file_path),
                        sha256=d_sha,
                        fileSize=d_sz,
                        mimeType=content_type,
                        r2Key=r2_key,
                    )
                    metadata.add(
                        file_id=df_id,
                        file_name=os.path.basename(file_path),
                        file_type=os.path.splitext(file_path)[1],
                        mime_type=content_type,
                        file_size=d_sz,
                        sha256=d_sha,
                        source_url=media_info.source_url,
                        final_url=media_info.source_url,
                        r2_key=r2_key,
                    )
                    manifest.record_file_downloaded()

            await self._finalize(manifest, metadata, status="COMPLETED")
            log.info("media_job_completed", run_id=self._run_db_id, datasets=dataset_paths)

        except Exception as exc:
            log.error("media_job_failed", run_id=self._run_db_id, error=str(exc))
            await self._pipeline.report_file_error(
                None, "UNKNOWN", f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
            )
            await self._finalize(manifest, metadata, status="FAILED")
            raise

    async def _finalize(
        self,
        manifest: ManifestWriter,
        metadata: MetadataWriter,
        *,
        status: str,
    ) -> None:
        """Upload metadata.jsonl and manifest.json, then update run status."""
        completed_at = datetime.now(timezone.utc)

        meta_path = metadata.finalize()
        try:
            storage.upload_file(meta_path, metadata.r2_key, "application/jsonl")
        except Exception as e:
            log.error("metadata_upload_failed", error=str(e))
        finally:
            metadata.cleanup()

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
