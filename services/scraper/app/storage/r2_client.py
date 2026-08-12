"""
Cloudflare R2 upload client using boto3.

Uses multipart upload for large files to avoid memory exhaustion.
Never buffers the entire file in RAM.
"""
import os
from typing import Optional

import boto3
from boto3.s3.transfer import TransferConfig
import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)

# Multipart threshold: files larger than this use multipart upload (8 MB)
MULTIPART_THRESHOLD = 8 * 1024 * 1024
# Part size for multipart uploads (8 MB)
MULTIPART_CHUNKSIZE = 8 * 1024 * 1024

_TRANSFER_CONFIG = TransferConfig(
    multipart_threshold=MULTIPART_THRESHOLD,
    multipart_chunksize=MULTIPART_CHUNKSIZE,
    max_concurrency=4,
    use_threads=True,
)


class R2Client:
    def __init__(self) -> None:
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name=settings.r2_region,
        )
        self._bucket = settings.r2_bucket

    def upload_file(
        self,
        local_path: str,
        r2_key: str,
        content_type: Optional[str] = None,
    ) -> None:
        """
        Upload a file from disk to R2 using multipart for large files.
        Raises on failure — callers must handle and retry.
        """
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        log.info("r2_upload_started", key=r2_key, path=local_path)

        self._client.upload_file(
            local_path,
            self._bucket,
            r2_key,
            ExtraArgs=extra_args or None,
            Config=_TRANSFER_CONFIG,
        )

        log.info("r2_upload_completed", key=r2_key)

    def upload_bytes(
        self,
        data: bytes,
        r2_key: str,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Upload a small in-memory object (metadata.jsonl, manifest.json)."""
        import io
        self._client.upload_fileobj(
            io.BytesIO(data),
            self._bucket,
            r2_key,
            ExtraArgs={"ContentType": content_type},
        )
        log.info("r2_bytes_upload_completed", key=r2_key, size=len(data))

    def object_exists(self, r2_key: str) -> bool:
        """Check if an object exists without downloading it."""
        try:
            self._client.head_object(Bucket=self._bucket, Key=r2_key)
            return True
        except self._client.exceptions.ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            raise


# Singleton instance
r2_client = R2Client()
