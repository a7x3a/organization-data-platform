"""
Telegram channel scraping via Telethon.

Discovers messages in a channel and turns each one into artifact(s) shaped
as DownloadResult — the exact type app.pipeline.file_pipeline.FilePipeline
already knows how to dedup/upload/record for the web collector. Each
message can produce up to two artifacts:
  - its media (photo/video/audio/document), if present and enabled
  - a small message.json record of its text/metadata, always

The second artifact is what captures channel *text* content (news/research
posts) — a media-only view would silently drop every text-only message.
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Optional

# Ensure standard MIME database recognizes ebook, archive, and dataset formats
mimetypes.add_type("application/epub+zip", ".epub")
mimetypes.add_type("application/x-mobipocket-ebook", ".mobi")
mimetypes.add_type("application/vnd.amazon.mobi8-ebook", ".azw3")
mimetypes.add_type("application/x-fb2+xml", ".fb2")
mimetypes.add_type("image/vnd.djvu", ".djvu")
mimetypes.add_type("application/x-djvu", ".djvu")
mimetypes.add_type("application/x-7z-compressed", ".7z")
mimetypes.add_type("application/x-rar-compressed", ".rar")
mimetypes.add_type("application/x-parquet", ".parquet")
mimetypes.add_type("application/jsonlines", ".jsonl")
mimetypes.add_type("audio/opus", ".opus")

import structlog
from telethon import TelegramClient
from telethon.tl.types import Message

from app.config.settings import settings
from app.downloader.downloader import (
    DownloadCancelled,
    DownloadResult,
    detect_mime,
    sanitize_filename,
)

log = structlog.get_logger(__name__)


@dataclass
class TelegramCollectorConfig:
    channels: list[str] = field(default_factory=list)
    message_limit: int = 500
    since_date: Optional[str] = None  # ISO date string — stop once messages predate this
    download_media: bool = True
    # e.g. ["photo", "video", "document", "audio"] — empty/None means "all kinds"
    include_media_types: Optional[list[str]] = None
    # e.g. [".pdf", ".epub", ".mobi"] — empty/None means "all extensions"
    allowed_extensions: Optional[list[str]] = None
    save_message_json: bool = False


def _message_url(channel: str, message_id: int) -> str:
    return f"https://t.me/{channel}/{message_id}"


def _media_kind(message: Any) -> Optional[str]:
    media = getattr(message, "media", None)
    if not media:
        return None
    if getattr(message, "photo", None) or getattr(media, "photo", None):
        return "photo"
    if getattr(message, "video", None) or getattr(media, "video", None):
        return "video"
    if getattr(message, "voice", None) or getattr(message, "audio", None) or getattr(media, "voice", None) or getattr(media, "audio", None):
        return "audio"
    if getattr(message, "document", None) or getattr(media, "document", None) or hasattr(media, "document"):
        return "document"
    if getattr(message, "file", None) is not None:
        return "document"
    return None


def _original_media_filename(message: Any) -> Optional[str]:
    file_obj = getattr(message, "file", None)
    if file_obj and getattr(file_obj, "name", None):
        return file_obj.name

    document = getattr(message, "document", None)
    if not document:
        return None
    attributes = getattr(document, "attributes", None) or []
    for attr in attributes:
        name = getattr(attr, "file_name", None) or getattr(attr, "filename", None)
        if name:
            return name
    return None


def _get_filename_ext(message: Any) -> Optional[str]:
    file_obj = getattr(message, "file", None)
    if file_obj and getattr(file_obj, "ext", None):
        ext = str(file_obj.ext).lower()
        if ext:
            return ext if ext.startswith(".") else f".{ext}"

    filename = _original_media_filename(message)
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext:
            return ext

    document = getattr(message, "document", None)
    mime = getattr(document, "mime_type", None) or (getattr(file_obj, "mime_type", None) if file_obj else None)
    if mime:
        mime_str = str(mime).lower()
        if "pdf" in mime_str:
            return ".pdf"
        if "epub" in mime_str:
            return ".epub"
        if "mobi" in mime_str or "azw" in mime_str:
            return ".mobi"
        if "fb2" in mime_str:
            return ".fb2"
        if "djvu" in mime_str:
            return ".djvu"
        if "mp3" in mime_str:
            return ".mp3"
        if "wav" in mime_str:
            return ".wav"
        if "ogg" in mime_str:
            return ".ogg"
        if "flac" in mime_str:
            return ".flac"
        if "json" in mime_str:
            return ".json"
        if "parquet" in mime_str:
            return ".parquet"
        if "csv" in mime_str:
            return ".csv"
        if "word" in mime_str or "docx" in mime_str:
            return ".docx"
        if "zip" in mime_str:
            return ".zip"
        if "rar" in mime_str:
            return ".rar"
        if "7z" in mime_str:
            return ".7z"
        guessed = mimetypes.guess_extension(mime_str)
        if guessed:
            return guessed.lower()
    return None


def _sha256_file(path: str) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(64 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


async def _download_media_artifact(
    client: Any,
    message: Any,
    kind: str,
    base_url: str,
    *,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
) -> Optional[DownloadResult]:
    if should_cancel is not None and await should_cancel():
        return None

    os.makedirs(settings.temp_dir, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(dir=settings.temp_dir)
    os.close(fd)

    async def _progress(received: int, total: int) -> None:
        if should_cancel is not None and await should_cancel():
            raise DownloadCancelled("Telegram download cancelled mid-stream")

    try:
        downloaded = await client.download_media(
            message, file=temp_path, progress_callback=_progress
        )
    except DownloadCancelled:
        log.info("telegram_media_download_cancelled", url=base_url)
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        return None
    except Exception as exc:
        log.warning("telegram_media_download_failed", url=base_url, error=str(exc))
        downloaded = None

    if should_cancel is not None and await should_cancel():
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass
        return None

    if not downloaded or not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
        return None

    mime_type = detect_mime(temp_path)
    original_name = _original_media_filename(message)
    if original_name:
        base, ext = os.path.splitext(original_name)
        file_name = sanitize_filename(base) + ext.lower()
    else:
        guessed_ext = mimetypes.guess_extension(mime_type) if mime_type else None
        file_name = sanitize_filename(f"{kind}_{message.id}") + (guessed_ext or "")

    return DownloadResult(
        source_url=base_url,
        final_url=base_url,
        file_name=file_name,
        extension=os.path.splitext(file_name)[1].lower() or None,
        mime_type=mime_type,
        file_size=os.path.getsize(temp_path),
        sha256=_sha256_file(temp_path),
        temp_path=temp_path,
    )


def _message_record_artifact(message: Any, channel: str, kind: Optional[str]) -> DownloadResult:
    reply_to_msg_id = getattr(message, "reply_to_msg_id", None)
    if reply_to_msg_id is None:
        reply_to = getattr(message, "reply_to", None)
        if reply_to is not None:
            reply_to_msg_id = getattr(reply_to, "reply_to_msg_id", None)

    record = {
        "message_id": message.id,
        "channel": channel,
        "date": message.date.isoformat() if getattr(message, "date", None) else None,
        "text": getattr(message, "message", "") or "",
        "sender_id": getattr(message, "sender_id", None),
        "views": getattr(message, "views", None),
        "forwards": getattr(message, "forwards", None),
        "reply_to_msg_id": reply_to_msg_id,
        "has_media": kind is not None,
        "media_kind": kind,
    }
    body = json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8")

    os.makedirs(settings.temp_dir, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=settings.temp_dir, delete=False, suffix=".json") as tmp:
        tmp.write(body)
        temp_path = tmp.name

    # `#message` distinguishes this artifact's identity from the media
    # artifact's URL above — without it, both share the same base
    # https://t.me/{channel}/{id} source_url, and the message record would
    # look like an already-known duplicate of the media file collected
    # moments earlier in the same message (skip_if_known_url dedups by
    # source_url, not content).
    url = f"{_message_url(channel, message.id)}#message"
    return DownloadResult(
        source_url=url,
        final_url=url,
        file_name=f"{message.id}.json",
        extension=".json",
        mime_type="application/json",
        file_size=len(body),
        sha256=hashlib.sha256(body).hexdigest(),
        temp_path=temp_path,
    )


async def scrape_channel(
    client: Any,
    channel: str,
    cfg: TelegramCollectorConfig,
    *,
    should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
) -> AsyncIterator[DownloadResult]:
    """
    Yields one DownloadResult per artifact discovered in `channel`, newest
    message first, up to cfg.message_limit (or until cfg.since_date).
    """
    since = None
    if cfg.since_date:
        since = datetime.fromisoformat(cfg.since_date)
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

    normalized_allowed = (
        [e.lower() if e.startswith(".") else f".{e.lower()}" for e in cfg.allowed_extensions]
        if cfg.allowed_extensions and len(cfg.allowed_extensions) > 0
        else None
    )

    async for message in client.iter_messages(channel, limit=cfg.message_limit):
        if should_cancel is not None and await should_cancel():
            return
        msg_date = getattr(message, "date", None)
        if since and msg_date and msg_date < since:
            break

        kind = _media_kind(message)
        base_url = _message_url(channel, message.id)

        if (
            cfg.download_media
            and kind
            and (not cfg.include_media_types or kind in cfg.include_media_types)
        ):
            skip_download = False
            ext = _get_filename_ext(message)
            if normalized_allowed and ext:
                if ext not in normalized_allowed:
                    log.info(
                        "telegram_skipping_unallowed_extension",
                        channel=channel,
                        msg_id=message.id,
                        ext=ext,
                        allowed=normalized_allowed,
                    )
                    skip_download = True

            if not skip_download:
                media_result = await _download_media_artifact(
                    client, message, kind, base_url, should_cancel=should_cancel
                )
                if media_result:
                    if (
                        normalized_allowed
                        and media_result.extension
                        and media_result.extension.lower() not in normalized_allowed
                    ):
                        log.info(
                            "telegram_discarding_post_download_unallowed_extension",
                            channel=channel,
                            msg_id=message.id,
                            ext=media_result.extension,
                            allowed=normalized_allowed,
                        )
                        if os.path.exists(media_result.temp_path):
                            try:
                                os.unlink(media_result.temp_path)
                            except OSError:
                                pass
                    else:
                        yield media_result

                if should_cancel is not None and await should_cancel():
                    return

        if should_cancel is not None and await should_cancel():
            return

        # Only yield message record JSON if save_message_json is explicitly True,
        # OR if ".json" is explicitly listed in normalized_allowed extensions.
        if cfg.save_message_json or (normalized_allowed and ".json" in normalized_allowed):
            yield _message_record_artifact(message, channel, kind)
