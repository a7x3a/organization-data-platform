"""
Storage provider selection. Everything in this codebase should import
`storage` from here rather than reaching for r2_client or LocalStorageProvider
directly — that's what makes STORAGE_PROVIDER=local vs r2 a config change,
not a code change.
"""
from app.config.settings import settings
from app.storage.local_provider import LocalStorageProvider

if settings.storage_provider == "r2":
    from app.storage.r2_client import r2_client as storage
else:
    storage = LocalStorageProvider()

__all__ = ["storage"]
