"""
Shared Telethon client construction for the Telegram collector.

Credentials (api_id/api_hash/session string) are account-level — one
Telegram user account shared by every TELEGRAM collector, configured once
via environment variables. Never stored per-collector, never sent to the
frontend, same pattern this codebase already uses for R2 credentials.
"""
from __future__ import annotations

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.config.settings import settings


class TelegramNotConfiguredError(Exception):
    """
    Raised when a TELEGRAM collector runs without account credentials set,
    or with a session that Telegram no longer considers authorized.
    """


def build_client() -> TelegramClient:
    """
    Build a TelegramClient from a saved session string.
    """
    from app.telegram.api_server import load_persistent_telegram_session

    load_persistent_telegram_session()

    if not (
        settings.telegram_api_id
        and settings.telegram_api_hash
        and settings.telegram_session_string
    ):
        raise TelegramNotConfiguredError(
            "TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_SESSION_STRING must all be set. "
            "Please configure Telegram authentication in Settings."
        )
    return TelegramClient(
        StringSession(settings.telegram_session_string),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
