from datetime import datetime, timezone
from app.storage.manifest_writer import ManifestWriter


def test_manifest_writer_record_file_found():
    now = datetime.now(timezone.utc)
    manifest = ManifestWriter(
        run_id="run-1",
        source_name="test-source",
        run_folder_key="runs/run-1",
        collector_version="1.0.0",
        started_at=now,
    )

    assert manifest.stats["files_found"] == 0

    manifest.record_file_found()
    manifest.record_file_found()
    assert manifest.stats["files_found"] == 2

    manifest.record_file_downloaded()
    assert manifest.stats["files_found"] == 2
    assert manifest.stats["files_downloaded"] == 1

    manifest.record_file_skipped()
    assert manifest.stats["files_found"] == 2
    assert manifest.stats["files_skipped"] == 1

    manifest.record_file_duplicate()
    manifest.record_file_failed()
    # Total processed is now 4 (1 downloaded, 1 skipped, 1 duplicate, 1 failed)
    # files_found should scale to max(2, 4) = 4
    assert manifest.stats["files_found"] == 4
