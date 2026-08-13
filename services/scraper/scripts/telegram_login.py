"""
One-time, interactive Telegram login — run this yourself, locally, NOT in
Docker and NOT as part of any automated job:

    cd services/scraper
    python -m scripts.telegram_login

A background worker (TelegramCollectionJob) cannot receive an OTP code, so
it can only ever use an already-authorized session. This script is the one
place that interactive login happens: it asks for your phone number, the
login code Telegram sends you, and your 2FA password if you have one set,
then prints a session string encoding that authorized login.

Paste the printed string into TELEGRAM_SESSION_STRING in your root .env.
Treat it like a password — anyone who has it can act as your Telegram
account without needing your phone or 2FA again.
"""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load the repo-root .env regardless of the CWD this is invoked from — the
# module docstring says "cd services/scraper" first, so the plain relative
# ".env" pydantic-settings normally reads (app/config/settings.py) would
# look in services/scraper/.env, which doesn't exist; the real .env lives
# at the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")


async def main() -> None:
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")

    if not api_id or not api_hash:
        print(
            "TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in your .env first.\n"
            "Get them from https://my.telegram.org -> API development tools.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Imported after the .env is loaded, and only here — this script is the
    # only place in the codebase allowed to use an interactive session.
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    client = TelegramClient(StringSession(), int(api_id), api_hash)

    async with client:
        # start() prompts for phone number, the code Telegram sends, and a
        # 2FA password if one is set — interactively, via stdin.
        await client.start()
        me = await client.get_me()
        session_string = client.session.save()

    print(f"\nLogged in as: {me.first_name} (@{me.username or me.id})\n")
    print("Add this to your .env as TELEGRAM_SESSION_STRING:\n")
    print(session_string)
    print(
        "\nTreat this string like a password — it grants full access to this "
        "Telegram account without needing your phone or 2FA again."
    )


if __name__ == "__main__":
    asyncio.run(main())
