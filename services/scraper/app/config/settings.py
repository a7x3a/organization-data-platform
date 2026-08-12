"""
Scraper Worker Configuration
All settings come from environment variables (never hardcoded).
"""
from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import Optional


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

    # ── Worker ────────────────────────────────────────────────
    worker_concurrency: int = 4
    max_file_size_mb: int = 500
    temp_dir: str = "/tmp/scraper"

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
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"


settings = Settings()  # type: ignore[call-arg]
