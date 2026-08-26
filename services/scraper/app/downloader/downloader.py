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

# How many chunks between cancellation checks. With FilePipeline's 0.5s cached
# is_cancelled implementation, checking on every chunk (1) is 0ms overhead
# while ensuring instant response to cancellation requests.
CANCEL_CHECK_EVERY_N_CHUNKS = 1


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
    Handles RFC 5987 filename*=UTF-8''... header formatting.
    """
    if content_disposition:
        # Check RFC 5987 encoding (filename*=UTF-8''...)
        utf8_match = re.search(r"filename\*\s*=\s*utf-8''([^;\n]+)", content_disposition, re.IGNORECASE)
        if utf8_match:
            return os.path.basename(unquote(utf8_match.group(1).strip()))

        # Check standard filename=...
        match = re.search(r'filename[^;=\n]*=([\'"]?)([^\1;]+)\1', content_disposition)
        if match:
            return os.path.basename(unquote(match.group(2).strip()))

    parsed = urlparse(url)
    basename = os.path.basename(unquote(parsed.path))
    ext = os.path.splitext(basename)[1].lower()
    
    # If basename is missing an extension or is a generic script page (.php, .asp, etc.), check query string
    if (not ext or ext in (".php", ".asp", ".aspx", ".jsp", ".cgi", ".html", ".htm", ".cfm")) and parsed.query:
        query_match = re.search(r'(?:file|filename|name|dn|title)=([^\&\#]+)', parsed.query, re.IGNORECASE)
        if query_match:
            candidate = os.path.basename(unquote(query_match.group(1).strip()))
            if os.path.splitext(candidate)[1]:
                return candidate

    return basename if basename else "unknown"


# Characters invalid in filenames on Windows (and unwise elsewhere): \/:*?"<>|
# plus control characters. Unicode text (Kurdish, Arabic, etc.) is untouched.
_UNSAFE_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
MAX_FILENAME_LENGTH = 150


def sanitize_filename(name: str) -> str:
    """
    Make a string safe to use as a filename on both Windows and POSIX:
    - Replaces whitespace, hyphens, and unsafe characters with underscores ('_')
    - Collapses multiple underscores into a single underscore
    - Strips leading/trailing underscores, periods, and spaces
    - Preserves Kurdish, Arabic, English, and other Unicode text
    """
    stem, ext = os.path.splitext(name)
    cleaned_stem = _UNSAFE_FILENAME_CHARS.sub("_", stem)
    cleaned_stem = re.sub(r"[\s\-_]+", "_", cleaned_stem).strip(" ._")
    if len(cleaned_stem) > MAX_FILENAME_LENGTH:
        cleaned_stem = cleaned_stem[:MAX_FILENAME_LENGTH].rstrip("_")

    cleaned_ext = _UNSAFE_FILENAME_CHARS.sub("", ext).strip(" ._")
    if cleaned_ext:
        return f"{cleaned_stem or 'unnamed'}.{cleaned_ext.lower()}"
    return cleaned_stem or "unnamed"


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
    Return the storage subfolder ('pdf/native/decoded', 'pdf/native/encoded', 'pdf/ocr', 'documents', 'ebooks', ...) for a file.
    PDF files are automatically inspected and sub-categorized into 'pdf/native/decoded', 'pdf/native/encoded', or 'pdf/ocr'.
    """
    clean_ext = ""
    if extension:
        clean_ext = extension.split("?")[0].split("#")[0].strip().lower()
        if clean_ext and not clean_ext.startswith("."):
            clean_ext = f".{clean_ext}"

    # 1. PDF special handling (with extraction & OCR categorization)
    is_pdf = (mime_type == "application/pdf") or (clean_ext == ".pdf")
    if is_pdf:
        if temp_path and os.path.exists(temp_path):
            from app.media.pdf_processor import extract_and_classify_pdf

            pdf_result = extract_and_classify_pdf(temp_path)
            return pdf_result.folder_path
        return "pdf/digital"

    # 2. Check Extension mapping first if clean_ext is a known non-generic extension
    if clean_ext and clean_ext in _CATEGORY_BY_EXTENSION:
        return _CATEGORY_BY_EXTENSION[clean_ext]

    # 3. Check MIME type prefix / pattern mapping
    if mime_type:
        mime_clean = mime_type.lower().split(";")[0].strip()
        if mime_clean == "application/pdf":
            return "pdf/digital"
        if mime_clean.startswith("audio/"):
            return "audio"
        if mime_clean.startswith("video/"):
            return "video"
        if mime_clean.startswith("image/"):
            return "images"
        if mime_clean.startswith("text/vtt") or "subrip" in mime_clean:
            return "subtitles"
        if mime_clean.startswith("text/"):
            return "text"
        if "epub" in mime_clean or "mobipocket" in mime_clean or "fictionbook" in mime_clean or "djvu" in mime_clean:
            return "ebooks"
        if "wordprocessingml" in mime_clean or "msword" in mime_clean or "opendocument.text" in mime_clean or "rtf" in mime_clean:
            return "documents"
        if "spreadsheet" in mime_clean or "excel" in mime_clean or "opendocument.spreadsheet" in mime_clean or mime_clean == "text/csv":
            return "spreadsheets"
        if "presentation" in mime_clean or "powerpoint" in mime_clean or "opendocument.presentation" in mime_clean:
            return "presentations"
        if any(tok in mime_clean for tok in ("zip", "rar", "tar", "compressed", "gzip", "7z")):
            return "archives"
        if any(tok in mime_clean for tok in ("json", "xml", "parquet", "feather")):
            return "data"

    # 4. Fallback default category
    return "files"

_CANONICAL_EXT_MAP = {
    "application/pdf": ".pdf",
    "application/epub+zip": ".epub",
    "application/x-mobipocket-ebook": ".mobi",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/zip": ".zip",
    "application/x-rar-compressed": ".rar",
    "application/x-7z-compressed": ".7z",
    "application/x-tar": ".tar",
    "application/gzip": ".gz",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/aac": ".aac",
    "video/mp4": ".mp4",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "application/json": ".json",
    "text/csv": ".csv",
    "application/xml": ".xml",
    "text/plain": ".txt",
    "application/x-parquet": ".parquet",
}


def detect_mime(file_path: str, declared: Optional[str] = None) -> Optional[str]:
    """Detect MIME type from file content (magic bytes), fall back to declared header or extension."""
    detected = None
    try:
        import magic
        detected = magic.from_file(file_path, mime=True)
        if detected and detected not in ("application/octet-stream", "binary/octet-stream"):
            return detected
    except Exception:
        pass

    if declared:
        clean_declared = declared.split(";")[0].strip().lower()
        if clean_declared and clean_declared not in ("application/octet-stream", "binary/octet-stream"):
            return clean_declared

    if detected:
        return detected

    ext = os.path.splitext(file_path)[1]
    guessed = mimetypes.guess_type(f"file{ext}")[0]
    return guessed or declared or "application/octet-stream"


_GENERIC_TITLES = {
    "untitled", "document", "microsoft word", "word document", "print", "scan",
    "adobe indesign", "pdf document", "download", "file", "blank", "new document",
    "page", "home", "index", "داگرتن", "کلیک بکە", "فایل"
}


def is_generic_title(title: str) -> bool:
    """True if title is empty, too short, or a standard boilerplate/generic string."""
    if not title or len(title.strip()) < 3:
        return True
    t = title.strip().lower()
    return any(gen in t for gen in _GENERIC_TITLES)


async def download_file(
    url: str,
    *,
    client: httpx.AsyncClient,
    max_size_bytes: Optional[int] = None,
    timeout: int = 30,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
    preferred_name: Optional[str] = None,
) -> DownloadResult:
    """
    Stream-download a file, compute SHA-256 incrementally, and save to a temp file.

    Raises DownloadError, FileTooLargeError, or InvalidContentError on failure.
    """
    max_bytes = max_size_bytes or settings.max_file_size_bytes
    log.info("download_started", url=url, preferred_name=preferred_name)

    os.makedirs(settings.temp_dir, exist_ok=True)

    hasher = hashlib.sha256()
    total_size = 0
    declared_mime = None
    final_url = url
    temp_path: Optional[str] = None

    parsed_url = urlparse(url)
    origin_referer = f"{parsed_url.scheme}://{parsed_url.netloc}/" if parsed_url.scheme and parsed_url.netloc else url

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ku;q=0.8,ar;q=0.7",
        "Referer": origin_referer,
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }
    try:
        async with client.stream(
            "GET",
            url,
            headers=headers,
            timeout=timeout,
            follow_redirects=True,
        ) as response:
            if response.status_code == 403:
                # Fallback: retry with exact document URL as referer
                fallback_headers = dict(headers)
                fallback_headers["Referer"] = url
                async with client.stream(
                    "GET",
                    url,
                    headers=fallback_headers,
                    timeout=timeout,
                    follow_redirects=True,
                ) as fallback_resp:
                    if fallback_resp.status_code != 200:
                        raise DownloadError(f"HTTP {fallback_resp.status_code} for {url}")
                    response = fallback_resp
            elif response.status_code != 200:
                raise DownloadError(f"HTTP {response.status_code} for {url}")

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

    # If extension is missing, or is a dynamic script / server page (.php, .asp, .html, etc.),
    # infer canonical file extension from verified magic-byte MIME type
    if mime_type and mime_type in _CANONICAL_EXT_MAP:
        inferred = _CANONICAL_EXT_MAP[mime_type]
        if not extension or extension in (
            ".php", ".asp", ".aspx", ".jsp", ".cgi", ".cfm", ".htm", ".html", ".action", ".do", ".ashx"
        ):
            extension = inferred
            if not file_name.lower().endswith(extension):
                base_name = os.path.splitext(file_name)[0]
                file_name = f"{base_name}{extension}"

    # Priority for naming:
    # 1. Embedded title inside PDF/EPUB/DOCX (if present and not generic)
    # 2. Contextual page/anchor name (preferred_name e.g. "وەقایعی کوردستان ژمارە ٣٤٥")
    # 3. Decoded, sanitized URL / Content-Disposition filename
    extracted_title = None
    if mime_type == "application/pdf" or extension == ".pdf":
        extracted_title = extract_pdf_title(temp_path)
    elif mime_type == "application/epub+zip" or extension == ".epub":
        extracted_title = extract_epub_title(temp_path)
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or extension == ".docx":
        extracted_title = extract_docx_title(temp_path)

    if extracted_title and not is_generic_title(extracted_title):
        clean_title = sanitize_filename(extracted_title)
        if clean_title and clean_title != "unnamed":
            base_t = os.path.splitext(clean_title)[0]
            file_name = f"{base_t}{extension or ''}"
    elif preferred_name and not is_generic_title(preferred_name):
        clean_preferred = sanitize_filename(preferred_name)
        if clean_preferred and clean_preferred != "unnamed":
            base_p = os.path.splitext(clean_preferred)[0]
            file_name = f"{base_p}{extension or ''}"

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
