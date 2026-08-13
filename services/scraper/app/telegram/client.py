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

    Deliberately never prompts for phone/OTP — that one-time interactive
    login happens once, locally, via `python -m scripts.telegram_login`,
    which is what produces TELEGRAM_SESSION_STRING. A background worker
    process has no way to receive an OTP code, so this must never block on
    one; callers connect explicitly and check is_user_authorized() rather
    than using TelegramClient.start(), which would try to log in
    interactively if the session were ever invalid.
    """
    if not (
        settings.telegram_api_id
        and settings.telegram_api_hash
        and settings.telegram_session_string
    ):
        raise TelegramNotConfiguredError(
            "TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_SESSION_STRING must all be set. "
            "Run `python -m scripts.telegram_login` once, locally, to generate the session string."
        )
    return TelegramClient(
        StringSession(settings.telegram_session_string),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
