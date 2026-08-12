"""
Integration test: crawl a real (local, controlled) website end-to-end
through discovery, download, hash, and dedupe. Spec §37's scenario, scoped
to what doesn't require a live API/DB (that leg is covered by the manual
E2E verification already run against the real stack).
"""
import hashlib

import httpx
import pytest

from app.spiders.http_spider import crawl, CrawlConfig
from app.downloader.downloader import download_file


@pytest.fixture
def temp_dir(tmp_path, monkeypatch):
    from app.config import settings as settings_module
    monkeypatch.setattr(settings_module.settings, "temp_dir", str(tmp_path))
    return str(tmp_path)


@pytest.fixture(autouse=True)
def allow_local_fixture_server(monkeypatch):
    # The crawler's SSRF protection correctly blocks 127.0.0.1 (verified in
    # test_ssrf_protection.py) — that check is exactly what a real crawl
    # against an untrusted URL must do. This test suite's own fixture server
    # runs on 127.0.0.1 by design, so it needs an explicit, test-only bypass
    # rather than a weakened production check.
    import app.spiders.http_spider as http_spider

    async def allow_all(_url: str) -> bool:
        return False

    monkeypatch.setattr(http_spider, "is_private_address", allow_all)


async def test_discovers_pages_and_files(test_website):
    config = CrawlConfig(
        start_urls=[f"{test_website}/index.html"],
        allowed_domains=[],
        allowed_url_patterns=[],
        excluded_url_patterns=[],
        allowed_extensions=[".pdf"],
        allowed_mime_types=[],
        max_depth=3,
        max_pages=100,
        max_files=100,
        request_delay_ms=0,
        concurrency=4,
    )

    result = await crawl(config)

    # index.html + page2.html = 2 pages crawled
    assert result.pages_crawled == 2
    discovered_urls = {f.url for f in result.files_discovered}
    assert discovered_urls == {
        f"{test_website}/docs/report-a.pdf",
        f"{test_website}/docs/report-b.pdf",
        f"{test_website}/docs/unique.pdf",
        f"{test_website}/docs/from-page2.pdf",
    }


async def test_respects_max_depth(test_website):
    # max_depth=1: extract links found ON the start page (depth 0 -> 1),
    # but don't follow links found on THOSE pages (would be depth 2).
    # page2.html's own PDF link is therefore out of reach.
    config = CrawlConfig(
        start_urls=[f"{test_website}/index.html"],
        allowed_domains=[],
        allowed_url_patterns=[],
        excluded_url_patterns=[],
        allowed_extensions=[".pdf"],
        allowed_mime_types=[],
        max_depth=1,
        max_pages=100,
        max_files=100,
        request_delay_ms=0,
        concurrency=4,
    )

    result = await crawl(config)

    discovered_urls = {f.url for f in result.files_discovered}
    assert f"{test_website}/docs/from-page2.pdf" not in discovered_urls
    assert f"{test_website}/docs/report-a.pdf" in discovered_urls


async def test_respects_max_files(test_website):
    config = CrawlConfig(
        start_urls=[f"{test_website}/index.html"],
        allowed_domains=[],
        allowed_url_patterns=[],
        excluded_url_patterns=[],
        allowed_extensions=[".pdf"],
        allowed_mime_types=[],
        max_depth=3,
        max_pages=100,
        max_files=2,
        request_delay_ms=0,
        concurrency=1,  # deterministic ordering for this assertion
    )

    result = await crawl(config)

    assert len(result.files_discovered) <= 2


async def test_full_pipeline_download_hash_and_detect_duplicate(test_website, temp_dir):
    """
    The actual spec §37 scenario: discover -> download -> hash -> detect the
    duplicate by content, not by filename or URL.
    """
    config = CrawlConfig(
        start_urls=[f"{test_website}/index.html"],
        allowed_domains=[],
        allowed_url_patterns=[],
        excluded_url_patterns=[],
        allowed_extensions=[".pdf"],
        allowed_mime_types=[],
        max_depth=3,
        max_pages=100,
        max_files=100,
        request_delay_ms=0,
        concurrency=4,
    )
    crawl_result = await crawl(config)

    seen_hashes = {}
    duplicates = []
    async with httpx.AsyncClient() as client:
        for discovered in crawl_result.files_discovered:
            result = await download_file(discovered.url, client=client)
            if result.sha256 in seen_hashes:
                duplicates.append((discovered.url, seen_hashes[result.sha256]))
            else:
                seen_hashes[result.sha256] = discovered.url

    # report-a.pdf and report-b.pdf have identical bytes -> exactly one duplicate pair
    assert len(duplicates) == 1
    dup_url, original_url = duplicates[0]
    assert {dup_url, original_url} == {
        f"{test_website}/docs/report-a.pdf",
        f"{test_website}/docs/report-b.pdf",
    }

    # And the hash really is what it claims to be — no shortcuts.
    from tests.conftest import DUPLICATE_CONTENT
    assert seen_hashes[hashlib.sha256(DUPLICATE_CONTENT).hexdigest()] in (
        f"{test_website}/docs/report-a.pdf",
        f"{test_website}/docs/report-b.pdf",
    )


async def test_handles_404_gracefully(test_website):
    async with httpx.AsyncClient() as client:
        from app.downloader.downloader import DownloadError
        with pytest.raises(DownloadError):
            await download_file(f"{test_website}/missing.pdf", client=client)
