"""
Local filesystem storage — mirrors R2Client's interface so collection_job.py
never needs to know which backend is active. Default for dev/test (spec:
local development must be completely functional without R2 credentials).
"""
import os
import shutil
from typing import Optional

import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)


class LocalStorageProvider:
    def __init__(self) -> None:
        self._root = os.path.abspath(settings.local_storage_dir)

    def _resolve(self, key: str) -> str:
        path = os.path.abspath(os.path.join(self._root, key))
        if not path.startswith(self._root + os.sep) and path != self._root:
            raise ValueError(f"Storage key resolves outside storage root: {key}")
        return path

    def upload_file(
        self,
        local_path: str,
        r2_key: str,
        content_type: Optional[str] = None,
    ) -> None:
        dest = self._resolve(r2_key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(local_path, dest)
        log.info("local_storage_upload_completed", key=r2_key)

    def upload_bytes(
        self,
        data: bytes,
        r2_key: str,
        content_type: str = "application/octet-stream",
    ) -> None:
        dest = self._resolve(r2_key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        log.info("local_storage_bytes_upload_completed", key=r2_key, size=len(data))

    def object_exists(self, r2_key: str) -> bool:
        return os.path.exists(self._resolve(r2_key))
