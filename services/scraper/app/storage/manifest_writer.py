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
        source_type: str = "web",
    ) -> None:
        self._run_id = run_id
        self._source_name = source_name
        self._run_folder_key = run_folder_key
        self._collector_version = collector_version
        self._started_at = started_at
        self._source_type = source_type

        self._files_found = 0
        self._files_downloaded = 0
        self._files_skipped = 0
        self._files_duplicate = 0
        self._files_failed = 0
        self._pages_crawled = 0
        self._total_bytes = 0
        self._categories: dict[str, dict] = {}

    def record_file_found(self) -> None:
        self._files_found += 1

    def record_file_downloaded(self, category: Optional[str] = None, file_name: Optional[str] = None, file_size: int = 0) -> None:
        self._files_downloaded += 1
        self._total_bytes += file_size
        if category:
            cat_clean = category.strip("/")
            if cat_clean not in self._categories:
                self._categories[cat_clean] = {
                    "files_count": 0,
                    "total_bytes": 0,
                    "manifest_path": f"{cat_clean}/manifest.json",
                    "metadata_path": f"{cat_clean}/metadata.jsonl",
                    "files": [],
                }
            self._categories[cat_clean]["files_count"] += 1
            self._categories[cat_clean]["total_bytes"] += file_size
            if file_name:
                self._categories[cat_clean]["files"].append({
                    "name": file_name,
                    "size": file_size,
                })

    def record_file_skipped(self) -> None:
        self._files_skipped += 1

    def record_file_duplicate(self) -> None:
        self._files_duplicate += 1

    def record_file_failed(self) -> None:
        self._files_failed += 1

    def record_page_crawled(self) -> None:
        self._pages_crawled += 1

    @property
    def total_processed(self) -> int:
        return (
            self._files_downloaded
            + self._files_skipped
            + self._files_duplicate
            + self._files_failed
        )

    @property
    def files_found(self) -> int:
        return max(self._files_found, self.total_processed)

    def build(self, *, status: str, completed_at: Optional[datetime] = None) -> dict:
        categories_summary = {}
        for cat_name, cat_data in self._categories.items():
            categories_summary[cat_name] = {
                "files_count": cat_data["files_count"],
                "total_bytes": cat_data["total_bytes"],
                "manifest_path": cat_data["manifest_path"],
                "metadata_path": cat_data["metadata_path"],
            }

        return {
            "run_id": self._run_id,
            "source": self._source_type,
            "source_name": self._source_name,
            "started_at": self._started_at.isoformat(),
            "completed_at": (completed_at or datetime.now(timezone.utc)).isoformat(),
            "status": status,
            "collector_version": self._collector_version,
            "files_found": self.files_found,
            "files_downloaded": self._files_downloaded,
            "files_skipped": self._files_skipped,
            "files_duplicate": self._files_duplicate,
            "files_failed": self._files_failed,
            "pages_crawled": self._pages_crawled,
            "total_bytes": self._total_bytes,
            "categories": categories_summary,
            "manifest_r2_key": self.r2_key,
            "metadata_r2_key": f"{self._run_folder_key}/metadata.jsonl",
        }

    def to_json(self, *, status: str, completed_at: Optional[datetime] = None) -> bytes:
        return json.dumps(
            self.build(status=status, completed_at=completed_at),
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")

    def build_category_manifests(self, *, status: str, completed_at: Optional[datetime] = None) -> dict[str, tuple[bytes, str]]:
        """
        Produces category-level manifests.
        Returns map: { category_name: (json_bytes, r2_key) }
        """
        comp_time = (completed_at or datetime.now(timezone.utc)).isoformat()
        manifests = {}
        for cat_name, cat_data in self._categories.items():
            cat_payload = {
                "run_id": self._run_id,
                "source": self._source_type,
                "source_name": self._source_name,
                "category": cat_name,
                "status": status,
                "completed_at": comp_time,
                "files_count": cat_data["files_count"],
                "total_bytes": cat_data["total_bytes"],
                "metadata_file": "metadata.jsonl",
                "files": cat_data["files"],
            }
            cat_bytes = json.dumps(cat_payload, ensure_ascii=False, indent=2).encode("utf-8")
            cat_r2_key = f"{self._run_folder_key}/{cat_name}/manifest.json"
            manifests[cat_name] = (cat_bytes, cat_r2_key)
        return manifests

    @property
    def r2_key(self) -> str:
        return f"{self._run_folder_key}/manifest.json"

    @property
    def stats(self) -> dict:
        return {
            "files_found": self.files_found,
            "files_downloaded": self._files_downloaded,
            "files_skipped": self._files_skipped,
            "files_duplicate": self._files_duplicate,
            "files_failed": self._files_failed,
            "pages_crawled": self._pages_crawled,
            "total_bytes": self._total_bytes,
        }
