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


from typing import Optional

class TelegramNotConfiguredError(Exception):
    """
    Raised when a TELEGRAM collector runs without account credentials set,
    or with a session that Telegram no longer considers authorized.
    """


def build_client(credentials: Optional[dict] = None) -> TelegramClient:
    """
    Build a TelegramClient from custom user credentials or global session string.
    """
    session_string = None
    api_id = None
    api_hash = None

    if credentials and credentials.get("sessionString"):
        session_string = credentials["sessionString"]
        api_id = credentials.get("apiId") or settings.telegram_api_id
        api_hash = credentials.get("apiHash") or settings.telegram_api_hash
    elif credentials and credentials.get("session_string"):
        session_string = credentials["session_string"]
        api_id = credentials.get("api_id") or settings.telegram_api_id
        api_hash = credentials.get("api_hash") or settings.telegram_api_hash
    else:
        from app.telegram.api_server import load_persistent_telegram_session

        load_persistent_telegram_session()
        session_string = settings.telegram_session_string
        api_id = settings.telegram_api_id
        api_hash = settings.telegram_api_hash

    if not (api_id and api_hash and session_string):
        raise TelegramNotConfiguredError(
            "TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_SESSION_STRING must all be set. "
            "Please configure and verify your Telegram account in the platform."
        )
    return TelegramClient(
        StringSession(session_string),
        int(api_id),
        api_hash,
    )
