"""
Storage provider selection.
If R2 credentials are set and connected, R2Client is selected.
Otherwise, LocalStorageProvider is selected for 100% local operation without cloud dependence.
"""
from app.config.settings import settings
from app.storage.local_provider import LocalStorageProvider


def _is_r2_active() -> bool:
    if settings.storage_provider != "r2":
        return False
    key = settings.r2_access_key_id
    secret = settings.r2_secret_access_key
    bucket = settings.r2_bucket
    if not (key and secret and bucket):
        return False
    if key in ("placeholder", "change_me") or secret in ("placeholder", "change_me"):
        return False
    return True


if _is_r2_active():
    try:
        from app.storage.r2_client import r2_client as storage
    except Exception:
        storage = LocalStorageProvider()
else:
    storage = LocalStorageProvider()

__all__ = ["storage"]
