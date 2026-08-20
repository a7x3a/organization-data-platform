"""
Tests for app.spiders.scrapling_spider — link extraction with Scrapling Selector,
resource discovery, and crawl execution against a mock server / response.
"""
import pytest
from scrapling import Selector

from app.spiders.http_spider import CrawlConfig
from app.spiders.scrapling_spider import (
    crawl_with_scrapling,
    extract_scrapling_links,
)


def test_extract_scrapling_links_from_string():
    html = """
    <html>
        <body>
            <a href="/reports/2026.pdf">Annual Report</a>
            <a href="https://external.org/data.csv">Data File</a>
            <a href="javascript:void(0)">Ignore me</a>
            <form action="/search">
                <input type="text" name="q" />
            </form>
            <iframe src="/embed/chart.html"></iframe>
            <button data-href="/docs/whitepaper.pdf">Download</button>
            <div onclick="location.href='/interactive/map'">View Map</div>
        </body>
    </html>
    """
    links = extract_scrapling_links(html, "https://example.org/home")

    assert "https://example.org/reports/2026.pdf" in links
    assert "https://external.org/data.csv" in links
    assert "https://example.org/search" in links
    assert "https://example.org/embed/chart.html" in links
    assert "https://example.org/docs/whitepaper.pdf" in links
    assert "https://example.org/interactive/map" in links
    assert not any("javascript:" in link for link in links)


def test_extract_scrapling_links_from_selector():
    html = """
    <div>
        <a href="subpage.html">Link 1</a>
        <a href="#section">Fragment</a>
    </div>
    """
    selector = Selector(content=html)
    links = extract_scrapling_links(selector, "https://example.org/docs/")

    assert "https://example.org/docs/subpage.html" in links
    assert not any("#section" in link for link in links)


@pytest.mark.asyncio
async def test_crawl_with_scrapling_mock(monkeypatch, respx_mock):
    """
    Test crawl_with_scrapling with mocked Scrapling response.
    """
    respx_mock.get("https://example.org/robots.txt").respond(
        status_code=200, text="User-agent: *\nAllow: /\n"
    )

    html_content = """
    <html>
        <body>
            <h1>Data Repository</h1>
            <a href="/dataset.csv">Download CSV</a>
            <a href="/docs/guide.pdf">Download PDF</a>
        </body>
    </html>
    """

    class MockScraplingResponse:
        def __init__(self, content: str):
            self.status = 200
            self.url = "https://example.org/"
            self.body = content.encode("utf-8")
            self.html_content = content
            self.text = content

        def css(self, query):
            return Selector(content=self.html_content).css(query)

    async def mock_get(self, url):
        return MockScraplingResponse(html_content)

    from scrapling import AsyncFetcher
    monkeypatch.setattr(AsyncFetcher, "get", mock_get)

    config = CrawlConfig(
        start_urls=["https://example.org/"],
        allowed_domains=["example.org"],
        allowed_url_patterns=[],
        excluded_url_patterns=[],
        allowed_extensions=["csv", "pdf"],
        allowed_mime_types=[],
        max_depth=2,
        max_pages=5,
        max_files=10,
        request_delay_ms=0,
        use_scrapling=True,
    )

    crawled_pages = 0
    found_files = 0

    async def on_page_crawled():
        nonlocal crawled_pages
        crawled_pages += 1

    async def on_file_found():
        nonlocal found_files
        found_files += 1

    result = await crawl_with_scrapling(
        config,
        on_page_crawled=on_page_crawled,
        on_file_found=on_file_found,
    )

    assert result.pages_crawled >= 1
    assert len(result.files_discovered) >= 1
    urls = [f.url for f in result.files_discovered]
    assert any("dataset.csv" in u or "guide.pdf" in u for u in urls)
