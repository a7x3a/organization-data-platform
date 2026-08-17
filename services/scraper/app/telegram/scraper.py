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


def _message_url(channel: str, message_id: int) -> str:
    return f"https://t.me/{channel}/{message_id}"


def _media_kind(message: Any) -> Optional[str]:
    if getattr(message, "photo", None):
        return "photo"
    if getattr(message, "video", None):
        return "video"
    if getattr(message, "voice", None) or getattr(message, "audio", None):
        return "audio"
    if getattr(message, "document", None):
        return "document"
    return None


def _original_media_filename(message: Any) -> Optional[str]:
    document = getattr(message, "document", None)
    if not document:
        return None
    attributes = getattr(document, "attributes", None) or []
    for attr in attributes:
        name = getattr(attr, "file_name", None)
        if name:
            return name
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
    message first, up to cfg.message_limit (or until cfg.since_date, since
    Telethon's default iteration order means "older than since_date" means
    every remaining message is too).
    """
    since = None
    if cfg.since_date:
        since = datetime.fromisoformat(cfg.since_date)
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

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
            media_result = await _download_media_artifact(
                client, message, kind, base_url, should_cancel=should_cancel
            )
            if media_result:
                yield media_result
            if should_cancel is not None and await should_cancel():
                return

        if should_cancel is not None and await should_cancel():
            return

        yield _message_record_artifact(message, channel, kind)
