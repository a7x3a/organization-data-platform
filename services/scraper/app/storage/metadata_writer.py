"""
Metadata JSONL writer.

One record per collected file, appended as the run progresses.
The final metadata.jsonl is uploaded to R2 at run completion.
"""
import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Optional


class MetadataWriter:
    """
    Writes one JSONL record per file to a temp file,
    then uploads the final metadata.jsonl to R2.
    """

    def __init__(self, run_folder_key: str, source_name: str, source_type: str = "web") -> None:
        self._run_folder_key = run_folder_key
        self._source_name = source_name
        self._source_type = source_type
        self._records: list[dict] = []
        self._tmp = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".jsonl",
            delete=False,
            encoding="utf-8",
        )

    def add(
        self,
        *,
        file_id: str,
        file_name: str,
        file_type: str,
        mime_type: Optional[str],
        file_size: int,
        sha256: str,
        source_url: str,
        final_url: str,
        r2_key: str,
        extra_metadata: Optional[dict] = None,
    ) -> None:
        record = {
            "file_id": file_id,
            "source": self._source_type,
            "source_name": self._source_name,
            "file_name": file_name,
            "file_type": file_type,
            "mime_type": mime_type,
            "file_size": file_size,
            "sha256": sha256,
            "date_downloaded": datetime.now(timezone.utc).isoformat(),
            "source_url": source_url,
            "final_url": final_url,
            "r2_key": r2_key,
        }
        if extra_metadata:
            record.update(extra_metadata)
        self._records.append(record)

        # 1. Write to main root metadata.jsonl
        self._tmp.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._tmp.flush()

        # 2. Write to per-category subfolder metadata.jsonl (e.g., pdf/native/decoded/metadata.jsonl)
        category_dir = os.path.dirname(r2_key.lstrip("/")).replace(f"{self._run_folder_key}/", "", 1)
        if category_dir and category_dir != self._run_folder_key:
            if category_dir not in getattr(self, "_category_writers", {}):
                if not hasattr(self, "_category_writers"):
                    self._category_writers = {}
                tmp_cat = tempfile.NamedTemporaryFile(
                    mode="w",
                    suffix=".jsonl",
                    delete=False,
                    encoding="utf-8",
                )
                self._category_writers[category_dir] = tmp_cat
            cat_writer = self._category_writers[category_dir]
            cat_writer.write(json.dumps(record, ensure_ascii=False) + "\n")
            cat_writer.flush()

    def finalize(self) -> str:
        """Close the main temp file and return its path for upload."""
        self._tmp.close()
        return self._tmp.name

    def finalize_categories(self) -> dict[str, tuple[str, str]]:
        """
        Close per-category temp writers and return a map of:
        { category_dir: (local_tmp_path, r2_key) }
        """
        category_files: dict[str, tuple[str, str]] = {}
        writers = getattr(self, "_category_writers", {})
        for category_dir, cat_writer in writers.items():
            cat_writer.close()
            cat_r2_key = f"{self._run_folder_key}/{category_dir}/metadata.jsonl"
            category_files[category_dir] = (cat_writer.name, cat_r2_key)
        return category_files

    def cleanup(self) -> None:
        """Remove all temp files after successful upload."""
        try:
            self._tmp.close()
        except Exception:
            pass
        try:
            os.unlink(self._tmp.name)
        except OSError:
            pass
        writers = getattr(self, "_category_writers", {})
        for cat_writer in writers.values():
            try:
                cat_writer.close()
            except Exception:
                pass
            try:
                os.unlink(cat_writer.name)
            except OSError:
                pass

    @property
    def r2_key(self) -> str:
        return f"{self._run_folder_key}/metadata.jsonl"
