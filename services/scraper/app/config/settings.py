"""
Scraper Worker Configuration
All settings come from environment variables (never hardcoded).
"""
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import Optional

def _find_repo_root() -> Path:
    curr = Path(__file__).resolve().parent
    for p in [curr] + list(curr.parents):
        if (p / "docker-compose.yml").exists() or (p / ".git").exists() or (p / "package.json").exists():
            return p
    return curr.parents[-1] if curr.parents else curr

REPO_ROOT = _find_repo_root()


class Settings(BaseSettings):
    # ── Environment ───────────────────────────────────────────
    node_env: str = "development"

    # ── Redis / BullMQ ────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Storage ───────────────────────────────────────────────
    # local: works with zero R2 credentials (default for dev/test).
    # r2: requires the four r2_* fields below.
    storage_provider: str = "local"
    local_storage_dir: str = "/app/storage"

    @field_validator("local_storage_dir", mode="before")
    @classmethod
    def resolve_local_storage_dir(cls, v: Optional[str]) -> str:
        dir_val = v or "/app/storage"
        import os
        from pathlib import Path

        # If direct path exists, use it
        if os.path.exists(dir_val):
            return os.path.abspath(dir_val)

        # Look in REPO_ROOT / "storage"
        repo_storage = REPO_ROOT / "storage"
        if repo_storage.exists():
            return str(repo_storage.resolve())

        # If running inside docker with /app/storage
        if os.path.exists("/app/storage"):
            return "/app/storage"

        # Fallback to creating REPO_ROOT / "storage" or normalized path
        try:
            repo_storage.mkdir(parents=True, exist_ok=True)
            return str(repo_storage.resolve())
        except Exception:
            return os.path.abspath(dir_val)

    # ── Cloudflare R2 (only required when storage_provider=r2) ─
    r2_endpoint: Optional[str] = None
    r2_bucket: Optional[str] = None
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_region: str = "auto"

    # ── API (for status callbacks) ────────────────────────────
    # The scraper updates run status by calling the API directly
    api_base_url: str = "http://api:4000"
    api_service_token: Optional[str] = None  # SERVICE_ACCOUNT JWT

    # ── Google Gemini API & Audio Processing ─────────────────
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.0-flash"
    audio_chunk_seconds: int = 60

    # ── Telegram (account-level credentials, shared by every TELEGRAM
    # collector — never stored per-collector, never sent to the frontend) ──
    telegram_api_id: Optional[int] = None
    telegram_api_hash: Optional[str] = None
    telegram_session_string: Optional[str] = None

    # docker-compose's `${TELEGRAM_API_ID:-}` passes an empty string, not an
    # unset variable, when a collector doesn't use Telegram — pydantic would
    # otherwise reject "" as "not a valid integer" instead of treating it the
    # same as "not configured".
    @field_validator("telegram_api_id", mode="before")
    @classmethod
    def blank_telegram_api_id_is_unset(cls, v):
        return None if v == "" else v

    # ── Worker ────────────────────────────────────────────────
    worker_concurrency: int = 4
    max_file_size_mb: int = 500
    temp_dir: str = "/tmp/scraper"

    @field_validator("redis_url", mode="before")
    @classmethod
    def resolve_redis_url(cls, v: Optional[str]) -> str:
        url = v or "redis://localhost:6379"
        import socket
        import os
        from urllib.parse import urlparse, urlunparse

        try:
            parsed = urlparse(url)
            host = parsed.hostname or "localhost"
            port = parsed.port or 6379

            is_docker = os.path.exists("/.dockerenv") or os.getenv("CONTAINER_NAME") is not None
            if is_docker and host in ("localhost", "127.0.0.1"):
                try:
                    socket.gethostbyname("redis")
                    netloc = f"redis:{port}"
                    return urlunparse(parsed._replace(netloc=netloc))
                except socket.gaierror:
                    pass
            elif not is_docker and host not in ("localhost", "127.0.0.1"):
                try:
                    socket.gethostbyname(host)
                except socket.gaierror:
                    netloc = f"localhost:{port}"
                    return urlunparse(parsed._replace(netloc=netloc))
        except Exception:
            pass
        return url

    @field_validator("api_base_url", mode="before")
    @classmethod
    def resolve_api_base_url(cls, v: Optional[str]) -> str:
        url = v or "http://localhost:4000"
        import socket
        import os
        from urllib.parse import urlparse, urlunparse

        try:
            parsed = urlparse(url)
            host = parsed.hostname or "localhost"
            port = parsed.port or 4000
            scheme = parsed.scheme or "http"

            is_docker = os.path.exists("/.dockerenv") or os.getenv("CONTAINER_NAME") is not None
            if is_docker and host in ("localhost", "127.0.0.1"):
                try:
                    socket.gethostbyname("api")
                    netloc = f"api:{port}"
                    return urlunparse(parsed._replace(netloc=netloc))
                except socket.gaierror:
                    pass
            elif not is_docker and host not in ("localhost", "127.0.0.1"):
                try:
                    socket.gethostbyname(host)
                except socket.gaierror:
                    netloc = f"localhost:{port}"
                    return urlunparse(parsed._replace(netloc=netloc))
        except Exception:
            pass
        return url


    # ── Scraping defaults (overridden per-collector) ──────────
    default_request_delay_ms: int = 1000
    default_concurrency: int = 4
    default_request_timeout_seconds: int = 30
    default_max_retries: int = 3

    @field_validator("max_file_size_mb")
    @classmethod
    def validate_max_file_size(cls, v: int) -> int:
        assert 1 <= v <= 10000, "max_file_size_mb must be between 1 and 10000"
        return v

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @model_validator(mode="after")
    def validate_r2_config(self) -> "Settings":
        if self.storage_provider == "r2":
            missing = [
                name
                for name in ("r2_endpoint", "r2_bucket", "r2_access_key_id", "r2_secret_access_key")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(f"storage_provider=r2 requires: {', '.join(missing)}")
        return self

    class Config:
        env_file = (
            str(REPO_ROOT / ".env"),
            str(Path(__file__).resolve().parents[2] / ".env"),
            ".env",
        )
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"


settings = Settings()  # type: ignore[call-arg]
