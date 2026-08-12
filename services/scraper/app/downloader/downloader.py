"""
Streaming downloader with MIME detection, size enforcement, and SHA-256.

Never buffers the full file in memory.
"""
import hashlib
import mimetypes
import os
import tempfile
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)

CHUNK_SIZE = 64 * 1024  # 64 KB


@dataclass
class DownloadResult:
    source_url: str
    final_url: str
    file_name: str
    extension: Optional[str]
    mime_type: Optional[str]
    file_size: int
    sha256: str
    temp_path: str  # temporary file path — caller must clean up


class DownloadError(Exception):
    """Raised when a download fails in a non-retryable way."""
    pass


class FileTooLargeError(DownloadError):
    """Raised when a file exceeds the configured size limit."""
    pass


class InvalidContentError(DownloadError):
    """Raised when content validation fails."""
    pass


def extract_filename(url: str, content_disposition: Optional[str] = None) -> str:
    """Extract a clean filename from URL or Content-Disposition header."""
    if content_disposition:
        import re
        match = re.search(r'filename[^;=\n]*=([\'"]?)([^\1;]+)\1', content_disposition)
        if match:
            return os.path.basename(match.group(2).strip())

    parsed = urlparse(url)
    basename = os.path.basename(parsed.path)
    return basename if basename else "unknown"


def detect_mime(file_path: str, declared: Optional[str] = None) -> Optional[str]:
    """Detect MIME type from file content (magic bytes), fall back to declared."""
    try:
        import magic
        detected = magic.from_file(file_path, mime=True)
        return detected
    except Exception:
        # Fall back to content-type header or mimetypes module
        if declared:
            return declared.split(";")[0].strip()
        ext = os.path.splitext(file_path)[1]
        return mimetypes.guess_type(f"file{ext}")[0]


async def download_file(
    url: str,
    *,
    client: httpx.AsyncClient,
    max_size_bytes: Optional[int] = None,
    timeout: int = 30,
) -> DownloadResult:
    """
    Stream-download a file, compute SHA-256 incrementally, and save to a temp file.

    Raises DownloadError, FileTooLargeError, or InvalidContentError on failure.
    """
    max_bytes = max_size_bytes or settings.max_file_size_bytes
    log.info("download_started", url=url)

    os.makedirs(settings.temp_dir, exist_ok=True)

    hasher = hashlib.sha256()
    total_size = 0
    declared_mime = None
    final_url = url

    async with client.stream(
        "GET",
        url,
        timeout=timeout,
        follow_redirects=True,
    ) as response:
        if response.status_code != 200:
            raise DownloadError(
                f"HTTP {response.status_code} for {url}"
            )

        final_url = str(response.url)
        declared_mime = response.headers.get("content-type")
        content_disposition = response.headers.get("content-disposition")
        file_name = extract_filename(final_url, content_disposition)

        with tempfile.NamedTemporaryFile(
            dir=settings.temp_dir, delete=False, suffix=os.path.splitext(file_name)[1]
        ) as tmp:
            temp_path = tmp.name

            async for chunk in response.aiter_bytes(CHUNK_SIZE):
                total_size += len(chunk)
                if total_size > max_bytes:
                    os.unlink(temp_path)
                    raise FileTooLargeError(
                        f"File exceeds {max_bytes} bytes at {url}"
                    )
                hasher.update(chunk)
                tmp.write(chunk)

    if total_size == 0:
        os.unlink(temp_path)
        raise InvalidContentError(f"Empty response body from {url}")

    sha256 = hasher.hexdigest()
    mime_type = detect_mime(temp_path, declared_mime)
    extension = os.path.splitext(file_name)[1].lower() or None

    log.info(
        "download_completed",
        url=url,
        final_url=final_url,
        file_name=file_name,
        sha256=sha256,
        size=total_size,
        mime=mime_type,
    )

    return DownloadResult(
        source_url=url,
        final_url=final_url,
        file_name=file_name,
        extension=extension,
        mime_type=mime_type,
        file_size=total_size,
        sha256=sha256,
        temp_path=temp_path,
    )
