"""
Manifest writer.

Produces manifest.json describing the entire collection run.
"""
import json
from datetime import datetime, timezone
from typing import Optional


class ManifestWriter:
    def __init__(
        self,
        *,
        run_id: str,
        source_name: str,
        run_folder_key: str,
        collector_version: str,
        started_at: datetime,
    ) -> None:
        self._run_id = run_id
        self._source_name = source_name
        self._run_folder_key = run_folder_key
        self._collector_version = collector_version
        self._started_at = started_at

        self._files_found = 0
        self._files_downloaded = 0
        self._files_skipped = 0
        self._files_duplicate = 0
        self._files_failed = 0
        self._pages_crawled = 0

    def record_file_downloaded(self) -> None:
        self._files_found += 1
        self._files_downloaded += 1

    def record_file_skipped(self) -> None:
        self._files_found += 1
        self._files_skipped += 1

    def record_file_duplicate(self) -> None:
        self._files_found += 1
        self._files_duplicate += 1

    def record_file_failed(self) -> None:
        self._files_found += 1
        self._files_failed += 1

    def record_page_crawled(self) -> None:
        self._pages_crawled += 1

    def build(self, *, status: str, completed_at: Optional[datetime] = None) -> dict:
        return {
            "run_id": self._run_id,
            "source": "web",
            "source_name": self._source_name,
            "started_at": self._started_at.isoformat(),
            "completed_at": (completed_at or datetime.now(timezone.utc)).isoformat(),
            "files_found": self._files_found,
            "files_downloaded": self._files_downloaded,
            "files_skipped": self._files_skipped,
            "files_duplicate": self._files_duplicate,
            "files_failed": self._files_failed,
            "pages_crawled": self._pages_crawled,
            "collector_version": self._collector_version,
            "status": status,
        }

    def to_json(self, *, status: str, completed_at: Optional[datetime] = None) -> bytes:
        return json.dumps(
            self.build(status=status, completed_at=completed_at),
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

    @property
    def r2_key(self) -> str:
        return f"{self._run_folder_key}/manifest.json"

    @property
    def stats(self) -> dict:
        return {
            "files_found": self._files_found,
            "files_downloaded": self._files_downloaded,
            "files_skipped": self._files_skipped,
            "files_duplicate": self._files_duplicate,
            "files_failed": self._files_failed,
            "pages_crawled": self._pages_crawled,
        }
