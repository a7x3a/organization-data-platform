"""
Telegram Authentication & Status HTTP Management Server.

Runs as a lightweight HTTP server on port 8000 alongside the scraper worker,
enabling the frontend web UI to check login status, request OTP verification codes,
and complete Telegram authentication interactively.
"""
import asyncio
import json
import os
from pathlib import Path

import structlog
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from app.config.settings import settings

log = structlog.get_logger(__name__)

def get_target_env_files() -> list[Path]:
    """Find all relevant .env file locations (container mount, repo root, CWD)."""
    paths: list[Path] = []
    
    # 1. Docker container mount
    app_env = Path("/app/.env")
    if app_env.exists():
        paths.append(app_env)

    # 2. Repo root & parent directory search
    curr = Path(__file__).resolve().parent
    for p in [curr] + list(curr.parents):
        if (p / "docker-compose.yml").exists() or (p / ".git").exists() or (p / "package.json").exists():
            root_env = p / ".env"
            if root_env not in paths:
                paths.append(root_env)

        cand = p / ".env"
        if cand.exists() and cand not in paths:
            paths.append(cand)

    # 3. CWD .env
    cwd_env = Path.cwd() / ".env"
    if cwd_env.exists() and cwd_env not in paths:
        paths.append(cwd_env)

    return paths


def update_env_file(key_values: dict[str, str]) -> None:
    """Persist updated Telegram credentials to all active .env files."""
    env_paths = get_target_env_files()
    for env_path in env_paths:
        try:
            lines = []
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()

            updated_keys = set()
            new_lines = []

            for line in lines:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    key = stripped.split("=", 1)[0].strip()
                    if key in key_values:
                        new_lines.append(f"{key}={key_values[key]}\n")
                        updated_keys.add(key)
                        continue
                new_lines.append(line)

            for k, v in key_values.items():
                if k not in updated_keys:
                    new_lines.append(f"{k}={v}\n")

            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
            log.info("env_file_updated", path=str(env_path))
        except Exception as e:
            log.warning("env_file_update_failed", path=str(env_path), error=str(e))
def get_storage_session_file() -> Path:
    storage_dir = Path(settings.local_storage_dir)
    if not storage_dir.exists():
        try:
            storage_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
    return storage_dir / "telegram_session.json"


def save_persistent_telegram_session(api_id: int, api_hash: str, session_string: str) -> None:
    try:
        session_file = get_storage_session_file()
        payload = {
            "telegram_api_id": api_id,
            "telegram_api_hash": api_hash,
            "telegram_session_string": session_string,
        }
        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        log.info("persistent_telegram_session_saved", path=str(session_file))
    except Exception as e:
        log.warning("persistent_telegram_session_save_failed", error=str(e))


def load_persistent_telegram_session() -> None:
    try:
        session_file = get_storage_session_file()
        if session_file.exists():
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("telegram_session_string"):
                settings.telegram_session_string = data["telegram_session_string"]
                os.environ["TELEGRAM_SESSION_STRING"] = data["telegram_session_string"]
            if data.get("telegram_api_id"):
                settings.telegram_api_id = int(data["telegram_api_id"])
                os.environ["TELEGRAM_API_ID"] = str(data["telegram_api_id"])
            if data.get("telegram_api_hash"):
                settings.telegram_api_hash = data["telegram_api_hash"]
                os.environ["TELEGRAM_API_HASH"] = data["telegram_api_hash"]
            log.info("persistent_telegram_session_loaded", path=str(session_file))
    except Exception as e:
        log.warning("persistent_telegram_session_load_failed", error=str(e))


async def check_telegram_status() -> dict:
    """Check whether Telegram is configured and authorized."""
    load_persistent_telegram_session()
    api_id = settings.telegram_api_id
    api_hash = settings.telegram_api_hash
    session_str = settings.telegram_session_string

    api_id_str = str(api_id) if api_id else ""
    api_hash_set = bool(api_hash)

    if not api_id or not api_hash:
        return {
            "is_configured": False,
            "is_authorized": False,
            "api_id": api_id_str,
            "api_hash_set": api_hash_set,
            "reason": "TELEGRAM_API_ID or TELEGRAM_API_HASH not set",
        }

    if not session_str:
        return {
            "is_configured": True,
            "is_authorized": False,
            "api_id": api_id_str,
            "api_hash_set": api_hash_set,
            "reason": "TELEGRAM_SESSION_STRING not generated",
        }

    client = TelegramClient(StringSession(session_str), int(api_id), api_hash)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            settings.telegram_session_string = ""
            os.environ["TELEGRAM_SESSION_STRING"] = ""
            session_file = get_storage_session_file()
            if session_file.exists():
                try:
                    session_file.unlink()
                except Exception:
                    pass
            return {
                "is_configured": True,
                "is_authorized": False,
                "api_id": api_id_str,
                "api_hash_set": api_hash_set,
                "reason": "Telegram session is expired or unauthorized",
            }

        me = await client.get_me()
        user_info = {
            "id": getattr(me, "id", None),
            "first_name": getattr(me, "first_name", ""),
            "username": getattr(me, "username", ""),
            "phone": getattr(me, "phone", ""),
        }
        return {
            "is_configured": True,
            "is_authorized": True,
            "api_id": api_id_str,
            "api_hash_set": api_hash_set,
            "user": user_info,
        }
    except Exception as e:
        log.warning("telegram_status_check_failed", error=str(e))
        return {
            "is_configured": True,
            "is_authorized": False,
            "api_id": api_id_str,
            "api_hash_set": api_hash_set,
            "reason": f"Connection error: {str(e)}",
        }
    finally:
        try:
            res = client.disconnect()
            if res is not None:
                await res
        except Exception:
            pass


_pending_sessions: dict[str, str] = {}


async def send_verification_code(phone_number: str, api_id: str, api_hash: str) -> dict:
    """Send Telegram OTP login code to the user's phone or Telegram app."""
    api_id_str = str(api_id or settings.telegram_api_id or "").strip()
    api_hash_str = (api_hash or settings.telegram_api_hash or "").strip()

    if not api_id_str or not api_hash_str:
        raise ValueError("API ID and API Hash are required (get them from https://my.telegram.org)")

    try:
        api_id_int = int(api_id_str)
    except ValueError:
        raise ValueError(f"API ID must be a valid integer (e.g. 37579496), got: '{api_id_str}'")

    if not phone_number or not phone_number.strip():
        raise ValueError("Phone number is required (e.g. +964777777777)")

    phone_clean = phone_number.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not phone_clean.startswith("+"):
        phone_clean = f"+{phone_clean}"

    # Retain in-memory fallback if not already set
    if not settings.telegram_api_id:
        settings.telegram_api_id = api_id_int
    if not settings.telegram_api_hash:
        settings.telegram_api_hash = api_hash_str

    client = TelegramClient(StringSession(""), api_id_int, api_hash_str)
    await client.connect()
    try:
        res = await client.send_code_request(phone_clean)
        session_obj = getattr(client, "session", None)
        save_fn = getattr(session_obj, "save", None) if session_obj is not None else None
        raw_session = save_fn() if callable(save_fn) else ""
        temp_session: str = raw_session if isinstance(raw_session, str) else ""

        if temp_session:
            _pending_sessions[phone_clean] = temp_session

        return {
            "success": True,
            "phone_code_hash": res.phone_code_hash,
            "temp_session": temp_session,
            "message": f"Verification code sent to {phone_clean}",
        }
    finally:
        try:
            res = client.disconnect()
            if res is not None:
                await res
        except Exception:
            pass


async def verify_code_and_login(
    phone_number: str,
    phone_code_hash: str,
    code: str,
    password: str = "",
    api_id: str = "",
    api_hash: str = "",
    temp_session: str = "",
) -> dict:
    """Verify Telegram OTP code and optional 2FA password, saving session string."""
    phone_clean = phone_number.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if not phone_clean.startswith("+"):
        phone_clean = f"+{phone_clean}"

    target_api_id_str = str(api_id or settings.telegram_api_id or "").strip()
    target_api_hash = str(api_hash or settings.telegram_api_hash or "").strip()

    if not target_api_id_str or not target_api_hash:
        raise ValueError("API ID and API Hash must be set")

    try:
        target_api_id_int = int(target_api_id_str)
    except ValueError:
        raise ValueError("API ID must be a valid integer (e.g. 37579496)")

    target_temp = temp_session or _pending_sessions.get(phone_clean, "")

    client = TelegramClient(StringSession(target_temp), target_api_id_int, target_api_hash)
    await client.connect()
    try:
        try:
            await client.sign_in(
                phone_clean, code.strip(), phone_code_hash=phone_code_hash.strip()
            )
        except SessionPasswordNeededError:
            if not password or not password.strip():
                return {
                    "success": False,
                    "requires_2fa": True,
                    "error": "2FA Cloud Password is enabled on this Telegram account. Please enter your 2FA Password.",
                }
            await client.sign_in(password=password.strip())

        me = await client.get_me()
        session_obj = getattr(client, "session", None)
        save_fn = getattr(session_obj, "save", None) if session_obj is not None else None
        raw_session = save_fn() if callable(save_fn) else ""
        session_str: str = raw_session if isinstance(raw_session, str) else ""

        if not session_str:
            return {
                "success": False,
                "requires_2fa": False,
                "error": "Failed to generate Telegram session string.",
            }

        _pending_sessions.pop(phone_clean, None)

        user_info = {
            "id": getattr(me, "id", None),
            "first_name": getattr(me, "first_name", ""),
            "username": getattr(me, "username", ""),
            "phone": getattr(me, "phone", "") or phone_clean,
        }

        log.info("telegram_authenticated_successfully", user=user_info)

        return {
            "success": True,
            "requires_2fa": False,
            "session_string": session_str,
            "phone_number": phone_clean,
            "user": user_info,
        }
    finally:
        try:
            res = client.disconnect()
            if res is not None:
                await res
        except Exception:
            pass


async def handle_http_request(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    """Simple asyncio HTTP request handler for Telegram management endpoints."""
    try:
        request_line = await reader.readline()
        if not request_line:
            writer.close()
            return

        line_str = request_line.decode("utf-8", errors="ignore").strip()
        parts = line_str.split()
        if len(parts) < 2:
            writer.close()
            return

        method, path = parts[0], parts[1]

        # Read headers
        headers = {}
        content_len = 0
        while True:
            hline = await reader.readline()
            if not hline or hline == b"\r\n" or hline == b"\n":
                break
            h_decoded = hline.decode("utf-8", errors="ignore").strip()
            if ":" in h_decoded:
                k, v = h_decoded.split(":", 1)
                headers[k.strip().lower()] = v.strip()
                if k.strip().lower() == "content-length":
                    try:
                        content_len = int(v.strip())
                    except ValueError:
                        pass

        body_bytes = b""
        if content_len > 0:
            body_bytes = await reader.readexactly(content_len)

        body_data = {}
        if body_bytes:
            try:
                body_data = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                pass

        # Router dispatch
        response_data = {}
        status_code = 200

        if method == "GET" and path in ("/health", "/api/health"):
            response_data = {"status": "ok", "service": "scraper"}

        elif method == "GET" and path == "/telegram/status":
            response_data = await check_telegram_status()

        elif method == "POST" and path == "/telegram/send-code":
            try:
                phone = body_data.get("phone") or body_data.get("phoneNumber") or ""
                api_id = str(body_data.get("apiId") or settings.telegram_api_id or "")
                api_hash = str(body_data.get("apiHash") or settings.telegram_api_hash or "")
                response_data = await send_verification_code(phone, api_id, api_hash)
            except Exception as e:
                status_code = 400
                response_data = {"error": str(e)}

        elif method == "POST" and path == "/telegram/verify-code":
            try:
                phone = body_data.get("phone") or body_data.get("phoneNumber") or ""
                hash_val = body_data.get("phoneCodeHash") or body_data.get("hash") or ""
                code = body_data.get("code") or ""
                password = body_data.get("password") or ""
                api_id = str(body_data.get("apiId") or settings.telegram_api_id or "")
                api_hash = str(body_data.get("apiHash") or settings.telegram_api_hash or "")
                temp_sess = str(body_data.get("tempSession") or body_data.get("temp_session") or "")
                res = await verify_code_and_login(phone, hash_val, code, password, api_id, api_hash, temp_sess)
                if not res.get("success") and res.get("requires_2fa"):
                    status_code = 401
                response_data = res
            except Exception as e:
                log.error("verify_code_error", error=str(e), exc_info=True)
                status_code = 400
                response_data = {"error": str(e), "message": str(e)}
        else:
            status_code = 404
            response_data = {"error": "Not Found"}

        payload = json.dumps(response_data, ensure_ascii=False).encode("utf-8")
        header_resp = (
            f"HTTP/1.1 {status_code} OK\r\n"
            f"Content-Type: application/json; charset=utf-8\r\n"
            f"Content-Length: {len(payload)}\r\n"
            f"Access-Control-Allow-Origin: *\r\n"
            f"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
            f"Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
            f"\r\n"
        ).encode("utf-8")

        writer.write(header_resp + payload)
        await writer.drain()

    except Exception as e:
        log.error("http_handler_error", error=str(e))
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def start_telegram_api_server(host: str = "0.0.0.0", port: int = 8000) -> asyncio.Server:
    """Start the background Telegram auth HTTP server."""
    server = await asyncio.start_server(handle_http_request, host, port)
    log.info("telegram_api_server_started", host=host, port=port)
    return server
