"""
Streaming downloader with MIME detection, size enforcement, and SHA-256.

Never buffers the full file in memory.
"""
import hashlib
import mimetypes
import os
import re
import tempfile
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional
from urllib.parse import unquote, urlparse

import httpx
import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)

CHUNK_SIZE = 64 * 1024  # 64 KB

# How many chunks between cancellation checks — each check is an API round
# trip, so this trades responsiveness for load. 32 chunks = ~2MB between
# checks, which keeps a multi-minute download of a large file cancellable
# without polling the API on every 64KB chunk.
CANCEL_CHECK_EVERY_N_CHUNKS = 32


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


class DownloadCancelled(DownloadError):
    """Raised when should_cancel() returns True mid-stream."""
    pass


def extract_filename(url: str, content_disposition: Optional[str] = None) -> str:
    """
    Extract a clean filename from URL or Content-Disposition header.

    URL paths arrive percent-encoded (e.g. Kurdish/Arabic script shows up as
    %D8%A6%D8%A7%D8%B4%D8%AA%DB%8C) — without unquote() every non-ASCII
    filename gets stored under a garbled, unreadable name instead of its
    real text.
    """
    if content_disposition:
        match = re.search(r'filename[^;=\n]*=([\'"]?)([^\1;]+)\1', content_disposition)
        if match:
            return os.path.basename(unquote(match.group(2).strip()))

    parsed = urlparse(url)
    basename = os.path.basename(unquote(parsed.path))
    return basename if basename else "unknown"


# Characters invalid in filenames on Windows (and unwise elsewhere): \/:*?"<>|
# plus control characters. Unicode text (Kurdish, Arabic, etc.) is untouched.
_UNSAFE_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
MAX_FILENAME_LENGTH = 150


def sanitize_filename(name: str) -> str:
    """Make a string safe to use as a filename on both Windows and POSIX."""
    cleaned = _UNSAFE_FILENAME_CHARS.sub(" ", name).strip(" .")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if len(cleaned) > MAX_FILENAME_LENGTH:
        cleaned = cleaned[:MAX_FILENAME_LENGTH].rstrip()
    return cleaned or "unnamed"


def extract_pdf_title(file_path: str) -> Optional[str]:
    """
    Read a PDF's embedded Title metadata, if present. Many scanned/generated
    PDFs carry a real human title even when their URL is an opaque slug —
    preferring it gives collected documents a readable name instead of
    whatever the source site happened to put in the URL.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        title = (reader.metadata.title or "").strip() if reader.metadata else ""
        return title or None
    except Exception:
        # Encrypted/corrupt/non-PDF-despite-extension — fall back silently,
        # the URL-derived name is always available.
        return None


def extract_epub_title(file_path: str) -> Optional[str]:
    """Read an EPUB ebook's embedded <dc:title> metadata from content.opf."""
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(file_path, 'r') as z:
            if "META-INF/container.xml" in z.namelist():
                container_data = z.read("META-INF/container.xml")
                root = ET.fromstring(container_data)
                rootfile = root.find(".//{*}rootfile")
                if rootfile is not None:
                    opf_path = rootfile.attrib.get("full-path")
                    if opf_path and opf_path in z.namelist():
                        opf_data = z.read(opf_path)
                        opf_root = ET.fromstring(opf_data)
                        title_elem = opf_root.find(".//{*}title")
                        if title_elem is not None and title_elem.text:
                            return title_elem.text.strip() or None
    except Exception:
        return None
    return None


def extract_docx_title(file_path: str) -> Optional[str]:
    """Read a DOCX document's embedded core properties title metadata."""
    try:
        import zipfile
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(file_path, 'r') as z:
            if "docProps/core.xml" in z.namelist():
                core_data = z.read("docProps/core.xml")
                root = ET.fromstring(core_data)
                title_elem = root.find(".//{*}title")
                if title_elem is not None and title_elem.text:
                    return title_elem.text.strip() or None
    except Exception:
        return None
    return None


# Storage-folder category per file type — keeps 00_raw from becoming one
# giant "files" bucket mixing PDFs, audio, video and everything else.
# Checked mime_type first (authoritative, from detect_mime's magic-byte
# sniffing), extension as a fallback for when mime detection comes back
# generic (application/octet-stream) or empty.
_CATEGORY_BY_EXTENSION = {
    ".pdf": "pdf",
    ".doc": "documents", ".docx": "documents", ".odt": "documents", ".rtf": "documents", ".pages": "documents",
    ".xls": "spreadsheets", ".xlsx": "spreadsheets", ".ods": "spreadsheets", ".csv": "spreadsheets", ".tsv": "spreadsheets",
    ".ppt": "presentations", ".pptx": "presentations", ".odp": "presentations",
    ".zip": "archives", ".rar": "archives", ".7z": "archives", ".tar": "archives",
    ".gz": "archives", ".bz2": "archives", ".xz": "archives", ".iso": "archives",
    ".txt": "text", ".md": "text", ".rst": "text",
    ".epub": "ebooks", ".mobi": "ebooks", ".azw3": "ebooks", ".fb2": "ebooks", ".djvu": "ebooks", ".cbz": "ebooks", ".cbr": "ebooks", ".chm": "ebooks",
    ".mp3": "audio", ".m4a": "audio", ".wav": "audio", ".flac": "audio", ".ogg": "audio", ".opus": "audio", ".aac": "audio", ".wma": "audio",
    ".mp4": "video", ".mkv": "video", ".avi": "video", ".mov": "video", ".webm": "video", ".flv": "video", ".wmv": "video", ".m4v": "video",
    ".jpg": "images", ".jpeg": "images", ".png": "images", ".gif": "images", ".webp": "images", ".svg": "images", ".bmp": "images", ".ico": "images",
    ".srt": "subtitles", ".vtt": "subtitles",
    ".json": "data", ".jsonl": "data", ".xml": "data", ".parquet": "data", ".arrow": "data", ".feather": "data",
    ".py": "code", ".js": "code", ".ts": "code", ".html": "code", ".css": "code", ".sql": "code", ".yaml": "code", ".yml": "code",
}


def categorize_file(
    mime_type: Optional[str],
    extension: Optional[str],
    temp_path: Optional[str] = None,
) -> str:
    """
    Return the storage subfolder ('pdf/native/decoded', 'pdf/native/encoded', 'pdf/ocr', 'audio', ...) for a file.
    PDF files are automatically inspected and sub-categorized into 'pdf/native/decoded', 'pdf/native/encoded', or 'pdf/ocr'.
    """
    clean_ext = ""
    if extension:
        clean_ext = extension.split("?")[0].split("#")[0].strip().lower()
        if clean_ext and not clean_ext.startswith("."):
            clean_ext = f".{clean_ext}"

    is_pdf = (mime_type == "application/pdf") or (clean_ext == ".pdf")
    if is_pdf:
        if temp_path and os.path.exists(temp_path):
            from app.media.pdf_processor import extract_and_classify_pdf

            pdf_result = extract_and_classify_pdf(temp_path)
            return pdf_result.folder_path
        return "pdf/native/decoded"

    if mime_type:
        mime_clean = mime_type.lower()
        if mime_clean == "application/pdf":
            return "pdf/native/decoded"
        if mime_clean.startswith("audio/"):
            return "audio"
        if mime_clean.startswith("video/"):
            return "video"
        if mime_clean.startswith("image/"):
            return "images"
        if mime_clean.startswith("text/"):
            return "text"
        if "zip" in mime_clean or "rar" in mime_clean or "tar" in mime_clean or "compressed" in mime_clean:
            return "archives"

    if clean_ext:
        category = _CATEGORY_BY_EXTENSION.get(clean_ext)
        if category:
            return category

    return "other"


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
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
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
    temp_path: Optional[str] = None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ku;q=0.8,ar;q=0.7",
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
    }
    try:
        async with client.stream(
            "GET",
            url,
            headers=headers,
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
            raw_name = extract_filename(final_url, content_disposition)
            _base, _ext = os.path.splitext(raw_name)
            file_name = sanitize_filename(_base) + _ext.lower()

            too_large = False
            cancelled = False
            chunk_count = 0
            with tempfile.NamedTemporaryFile(
                dir=settings.temp_dir, delete=False, suffix=os.path.splitext(file_name)[1]
            ) as tmp:
                temp_path = tmp.name

                async for chunk in response.aiter_bytes(CHUNK_SIZE):
                    total_size += len(chunk)
                    if total_size > max_bytes:
                        # Don't unlink here — the file handle is still open, and
                        # deleting an open file is a PermissionError on Windows
                        # (POSIX allows it; this must work on both). Stop writing
                        # and let the `with` block close it first.
                        too_large = True
                        break
                    hasher.update(chunk)
                    tmp.write(chunk)

                    chunk_count += 1
                    if should_cancel is not None and chunk_count % CANCEL_CHECK_EVERY_N_CHUNKS == 0:
                        if await should_cancel():
                            cancelled = True
                            break
    except httpx.HTTPError as e:
        # Network-level failures (timeout, connection reset, TLS errors, …) —
        # distinct from the HTTP-status DownloadError above. Unlike a bad
        # status code, these aren't raised until the temp file's `with` block
        # (and the streaming response) has already unwound and closed, so
        # unlinking here is safe on Windows. Without this, one flaky/slow
        # file kills the whole run instead of just failing that one file —
        # str(e) is often empty for these exceptions, so fall back to the
        # exception's type name.
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        raise DownloadError(f"{type(e).__name__}: {e}" if str(e) else type(e).__name__) from e

    if too_large:
        os.unlink(temp_path)
        raise FileTooLargeError(f"File exceeds {max_bytes} bytes at {url}")

    if cancelled:
        os.unlink(temp_path)
        raise DownloadCancelled(f"Cancelled mid-download of {url}")

    if total_size == 0:
        os.unlink(temp_path)
        raise InvalidContentError(f"Empty response body from {url}")

    sha256 = hasher.hexdigest()
    mime_type = detect_mime(temp_path, declared_mime)
    extension = os.path.splitext(file_name)[1].lower() or None

    # Prefer the document's own embedded title over its URL-derived name
    # when one exists — URLs are often opaque slugs even when the file
    # itself carries a real, readable book/document title.
    extracted_title = None
    if mime_type == "application/pdf" or extension == ".pdf":
        extracted_title = extract_pdf_title(temp_path)
    elif mime_type == "application/epub+zip" or extension == ".epub":
        extracted_title = extract_epub_title(temp_path)
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or extension == ".docx":
        extracted_title = extract_docx_title(temp_path)

    if extracted_title:
        clean_title = sanitize_filename(extracted_title)
        if clean_title and clean_title != "unnamed":
            file_name = clean_title + (extension or "")

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
