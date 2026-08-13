"""
Tests for app.telegram.scraper — pure logic (media kind/filename detection,
message-record artifact shape) plus an end-to-end scrape_channel pass
against a fake Telethon client (no real network/Telegram API involved).
"""
import json
import os

import pytest

from app.telegram.scraper import (
    TelegramCollectorConfig,
    _media_kind,
    _message_record_artifact,
    _original_media_filename,
    scrape_channel,
)


@pytest.fixture
def temp_dir(tmp_path, monkeypatch):
    from app.config import settings as settings_module
    monkeypatch.setattr(settings_module.settings, "temp_dir", str(tmp_path))
    return str(tmp_path)


class FakeAttr:
    def __init__(self, file_name=None):
        self.file_name = file_name


class FakeDocument:
    def __init__(self, attributes=None):
        self.attributes = attributes or []


class FakeMessage:
    def __init__(
        self,
        id,
        date=None,
        text="",
        photo=None,
        video=None,
        voice=None,
        audio=None,
        document=None,
        sender_id=1,
        views=0,
        forwards=0,
        reply_to_msg_id=None,
    ):
        self.id = id
        self.date = date
        self.message = text
        self.photo = photo
        self.video = video
        self.voice = voice
        self.audio = audio
        self.document = document
        self.sender_id = sender_id
        self.views = views
        self.forwards = forwards
        self.reply_to_msg_id = reply_to_msg_id


class FakeClient:
    """Duck-types just the two TelegramClient methods scrape_channel calls."""

    def __init__(self, messages, media_bytes=b"fake media bytes"):
        self._messages = messages
        self._media_bytes = media_bytes
        self.download_calls = 0

    def iter_messages(self, channel, limit=None):
        messages = self._messages[:limit] if limit else self._messages

        async def gen():
            for m in messages:
                yield m

        return gen()

    async def download_media(self, message, file=None):
        self.download_calls += 1
        with open(file, "wb") as f:
            f.write(self._media_bytes)
        return file


# ─── _media_kind / _original_media_filename ─────────────────────

def test_media_kind_detects_each_type():
    assert _media_kind(FakeMessage(1, photo=True)) == "photo"
    assert _media_kind(FakeMessage(2, video=True)) == "video"
    assert _media_kind(FakeMessage(3, voice=True)) == "audio"
    assert _media_kind(FakeMessage(4, audio=True)) == "audio"
    assert _media_kind(FakeMessage(5, document=FakeDocument())) == "document"
    assert _media_kind(FakeMessage(6)) is None


def test_original_media_filename_reads_document_attribute():
    doc = FakeDocument(attributes=[FakeAttr(file_name=None), FakeAttr(file_name="report.pdf")])
    assert _original_media_filename(FakeMessage(1, document=doc)) == "report.pdf"


def test_original_media_filename_none_when_no_document():
    assert _original_media_filename(FakeMessage(1)) is None


# ─── _message_record_artifact ───────────────────────────────────

def test_message_record_artifact_shape_and_distinct_url(temp_dir):
    message = FakeMessage(42, text="hello world", sender_id=7, views=100, forwards=3)
    result = _message_record_artifact(message, "mychannel", kind=None)

    assert result.source_url == "https://t.me/mychannel/42#message"
    assert result.file_name == "42.json"
    assert result.mime_type == "application/json"

    with open(result.temp_path, encoding="utf-8") as f:
        record = json.load(f)
    assert record["message_id"] == 42
    assert record["channel"] == "mychannel"
    assert record["text"] == "hello world"
    assert record["views"] == 100
    assert record["has_media"] is False
    os.unlink(result.temp_path)


# ─── scrape_channel ──────────────────────────────────────────────

async def test_scrape_channel_yields_media_and_message_record(temp_dir):
    messages = [FakeMessage(1, text="a photo", photo=True)]
    client = FakeClient(messages)
    cfg = TelegramCollectorConfig(channels=["chan"], message_limit=10)

    results = [r async for r in scrape_channel(client, "chan", cfg)]

    assert len(results) == 2  # media artifact + message.json
    media, record = results
    assert media.source_url == "https://t.me/chan/1"
    assert record.source_url == "https://t.me/chan/1#message"
    with open(media.temp_path, "rb") as f:
        assert f.read() == b"fake media bytes"
    os.unlink(media.temp_path)
    os.unlink(record.temp_path)


async def test_scrape_channel_skips_media_when_download_disabled(temp_dir):
    messages = [FakeMessage(1, text="a photo", photo=True)]
    client = FakeClient(messages)
    cfg = TelegramCollectorConfig(channels=["chan"], message_limit=10, download_media=False)

    results = [r async for r in scrape_channel(client, "chan", cfg)]

    assert len(results) == 1  # message.json only
    assert client.download_calls == 0
    os.unlink(results[0].temp_path)


async def test_scrape_channel_filters_by_include_media_types(temp_dir):
    messages = [
        FakeMessage(1, photo=True),
        FakeMessage(2, video=True),
    ]
    client = FakeClient(messages)
    cfg = TelegramCollectorConfig(channels=["chan"], message_limit=10, include_media_types=["video"])

    results = [r async for r in scrape_channel(client, "chan", cfg)]

    # message 1 (photo, excluded): message.json only.
    # message 2 (video, included): media + message.json.
    urls = [r.source_url for r in results]
    assert "https://t.me/chan/1" not in urls
    assert "https://t.me/chan/2" in urls
    assert len(results) == 3
    for r in results:
        os.unlink(r.temp_path)


async def test_scrape_channel_stops_at_since_date(temp_dir):
    from datetime import datetime, timezone

    messages = [
        FakeMessage(3, date=datetime(2026, 1, 3, tzinfo=timezone.utc)),
        FakeMessage(2, date=datetime(2026, 1, 2, tzinfo=timezone.utc)),
        FakeMessage(1, date=datetime(2026, 1, 1, tzinfo=timezone.utc)),
    ]
    client = FakeClient(messages)
    cfg = TelegramCollectorConfig(
        channels=["chan"], message_limit=10, since_date="2026-01-02T00:00:00+00:00"
    )

    results = [r async for r in scrape_channel(client, "chan", cfg)]

    message_ids = {json.load(open(r.temp_path, encoding="utf-8"))["message_id"] for r in results}
    assert message_ids == {3, 2}  # message 1 predates since_date
    for r in results:
        os.unlink(r.temp_path)


async def test_scrape_channel_respects_cancellation(temp_dir):
    messages = [FakeMessage(1), FakeMessage(2), FakeMessage(3)]
    client = FakeClient(messages)
    cfg = TelegramCollectorConfig(channels=["chan"], message_limit=10, download_media=False)

    calls = {"n": 0}

    async def should_cancel():
        calls["n"] += 1
        return calls["n"] > 1  # cancel after the first message is processed

    results = [r async for r in scrape_channel(client, "chan", cfg, should_cancel=should_cancel)]
    for r in results:
        os.unlink(r.temp_path)
    assert len(results) <= 1
