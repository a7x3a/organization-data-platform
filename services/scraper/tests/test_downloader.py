import hashlib
import os

import httpx
import pytest
import respx

from app.downloader.downloader import (
    download_file,
    extract_filename,
    DownloadError,
    FileTooLargeError,
    InvalidContentError,
)


@pytest.fixture
def temp_dir(tmp_path, monkeypatch):
    from app.config import settings as settings_module
    monkeypatch.setattr(settings_module.settings, "temp_dir", str(tmp_path))
    return str(tmp_path)


class TestExtractFilename:
    def test_from_url_path(self):
        assert extract_filename("https://example.com/dir/report.pdf") == "report.pdf"

    def test_from_content_disposition(self):
        name = extract_filename(
            "https://example.com/download",
            content_disposition='attachment; filename="real-name.pdf"',
        )
        assert name == "real-name.pdf"

    def test_falls_back_to_unknown_for_empty_path(self):
        assert extract_filename("https://example.com/") == "unknown"


@respx.mock
class TestDownloadFile:
    async def test_downloads_and_hashes_content_correctly(self, temp_dir):
        content = b"hello world, this is test file content"
        respx.get("https://example.com/file.txt").mock(
            return_value=httpx.Response(200, content=content, headers={"content-type": "text/plain"})
        )

        async with httpx.AsyncClient() as client:
            result = await download_file("https://example.com/file.txt", client=client)

        assert result.sha256 == hashlib.sha256(content).hexdigest()
        assert result.file_size == len(content)
        assert os.path.exists(result.temp_path)
        with open(result.temp_path, "rb") as f:
            assert f.read() == content
        os.unlink(result.temp_path)

    async def test_rejects_file_exceeding_max_size(self, temp_dir):
        content = b"x" * 1000
        respx.get("https://example.com/big.bin").mock(
            return_value=httpx.Response(200, content=content)
        )

        async with httpx.AsyncClient() as client:
            with pytest.raises(FileTooLargeError):
                await download_file(
                    "https://example.com/big.bin", client=client, max_size_bytes=500
                )

    async def test_rejects_empty_response(self, temp_dir):
        respx.get("https://example.com/empty.txt").mock(
            return_value=httpx.Response(200, content=b"")
        )

        async with httpx.AsyncClient() as client:
            with pytest.raises(InvalidContentError):
                await download_file("https://example.com/empty.txt", client=client)

    async def test_rejects_non_200_status(self, temp_dir):
        respx.get("https://example.com/missing.txt").mock(
            return_value=httpx.Response(404)
        )

        async with httpx.AsyncClient() as client:
            with pytest.raises(DownloadError):
                await download_file("https://example.com/missing.txt", client=client)

    async def test_two_different_urls_same_content_hash_identically(self, temp_dir):
        # This is the whole basis of exact deduplication (spec §11).
        content = b"identical bytes regardless of source URL"
        respx.get("https://example.com/a.pdf").mock(
            return_value=httpx.Response(200, content=content)
        )
        respx.get("https://example.com/b.pdf").mock(
            return_value=httpx.Response(200, content=content)
        )

        async with httpx.AsyncClient() as client:
            result_a = await download_file("https://example.com/a.pdf", client=client)
            result_b = await download_file("https://example.com/b.pdf", client=client)

        assert result_a.sha256 == result_b.sha256
        os.unlink(result_a.temp_path)
        os.unlink(result_b.temp_path)
