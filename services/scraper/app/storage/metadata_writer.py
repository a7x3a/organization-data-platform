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

    def __init__(self, run_folder_key: str, source_name: str) -> None:
        self._run_folder_key = run_folder_key
        self._source_name = source_name
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
    ) -> None:
        record = {
            "file_id": file_id,
            "source": "web",
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
        self._records.append(record)
        self._tmp.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._tmp.flush()

    def finalize(self) -> str:
        """Close the temp file and return its path for upload."""
        self._tmp.close()
        return self._tmp.name

    def cleanup(self) -> None:
        """Remove the temp file after successful upload."""
        try:
            os.unlink(self._tmp.name)
        except FileNotFoundError:
            pass

    @property
    def r2_key(self) -> str:
        return f"{self._run_folder_key}/metadata.jsonl"
