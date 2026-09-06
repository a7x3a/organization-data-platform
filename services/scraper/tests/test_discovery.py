"""
Tests for app.discovery — the selectolax-based extractor that replaced
scrapy's LinkExtractor, plus robots.txt/sitemap discovery.
"""
import httpx
import pytest
import respx

from app.discovery.extractor import (
    extract_page_links,
    extract_resource_urls,
    extract_sitemap_locs,
    extract_page_text,
)
from app.discovery.robots import RobotsCache



# ─── extract_page_links ─────────────────────────────────────────

def test_extract_page_links_resolves_relative_hrefs():
    html = '<html><body><a href="/about">About</a><a href="https://other.com/x">X</a></body></html>'
    links = extract_page_links(html, "https://example.com/index.html")
    assert links == {"https://example.com/about", "https://other.com/x"}


def test_extract_page_links_skips_non_navigational_hrefs():
    html = """
    <a href="#section">Jump</a>
    <a href="mailto:a@b.com">Mail</a>
    <a href="tel:+123">Call</a>
    <a href="javascript:void(0)">JS</a>
    <a href="/real-page">Real</a>
    """
    links = extract_page_links(html, "https://example.com/")
    assert links == {"https://example.com/real-page"}


# ─── extract_resource_urls ──────────────────────────────────────

def test_extract_resource_urls_finds_embedded_media():
    html = """
    <img src="/img/photo.jpg">
    <img data-src="/img/lazy.png">
    <video src="/media/clip.mp4"></video>
    <source src="/media/audio.mp3">
    <embed src="/embeds/widget.pdf">
    <object data="/objects/report.pdf"></object>
    """
    resources = extract_resource_urls(html, "https://example.com/article")
    assert resources == {
        "https://example.com/img/photo.jpg",
        "https://example.com/img/lazy.png",
        "https://example.com/media/clip.mp4",
        "https://example.com/media/audio.mp3",
        "https://example.com/embeds/widget.pdf",
        "https://example.com/objects/report.pdf",
    }


def test_extract_resource_urls_only_follows_alternate_and_enclosure_link_rels():
    html = """
    <link rel="stylesheet" href="/style.css">
    <link rel="icon" href="/favicon.ico">
    <link rel="alternate" href="/feed.xml">
    <link rel="enclosure" href="/podcast-episode.mp3">
    """
    resources = extract_resource_urls(html, "https://example.com/")
    assert resources == {
        "https://example.com/feed.xml",
        "https://example.com/podcast-episode.mp3",
    }


def test_extract_resource_urls_splits_srcset_descriptors_into_separate_urls():
    html = '<img srcset="/a.jpg 1x, /b.jpg 2x" src="/a.jpg"><source srcset="/c.webp 640w">'
    resources = extract_resource_urls(html, "https://example.com/")
    assert resources == {
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
        "https://example.com/c.webp",
    }


def test_extract_resource_urls_finds_absolute_urls_in_inline_scripts():
    html = """
    <script>
      var downloadUrl = "https://cdn.example.com/datasets/report.parquet";
    </script>
    <script type="application/ld+json">
      {"url": "https://example.com/whitepaper.pdf", "@type": "ScholarlyArticle"}
    </script>
    """
    resources = extract_resource_urls(html, "https://example.com/")
    assert "https://cdn.example.com/datasets/report.parquet" in resources
    assert "https://example.com/whitepaper.pdf" in resources


def test_extract_resource_urls_ignores_plain_analytics_script_noise():
    html = """
    <script>
      analytics.track("pageview", {url: "https://example.com/page-not-a-file"});
    </script>
    """
    resources = extract_resource_urls(html, "https://example.com/")
    assert resources == set()


# ─── extract_sitemap_locs ───────────────────────────────────────

def test_extract_sitemap_locs_from_a_regular_sitemap():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page-a</loc></url>
      <url><loc>https://example.com/page-b</loc></url>
    </urlset>"""
    assert extract_sitemap_locs(xml) == [
        "https://example.com/page-a",
        "https://example.com/page-b",
    ]


def test_extract_sitemap_locs_from_a_sitemap_index():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
    </sitemapindex>"""
    assert extract_sitemap_locs(xml) == [
        "https://example.com/sitemap-1.xml",
        "https://example.com/sitemap-2.xml",
    ]


# ─── RobotsCache ─────────────────────────────────────────────────

@respx.mock
async def test_robots_cache_disallows_blocked_paths():
    respx.get("https://example.com/robots.txt").mock(
        return_value=httpx.Response(
            200,
            text="User-agent: *\nDisallow: /private/\n",
        )
    )
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        assert await robots.is_allowed("https://example.com/public/page", enabled=True) is True
        assert await robots.is_allowed("https://example.com/private/page", enabled=True) is False


@respx.mock
async def test_robots_cache_ignores_rules_when_disabled():
    respx.get("https://example.com/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nDisallow: /\n")
    )
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        assert await robots.is_allowed("https://example.com/anything", enabled=False) is True


@respx.mock
async def test_robots_cache_allows_everything_when_robots_txt_missing():
    respx.get("https://example.com/robots.txt").mock(return_value=httpx.Response(404))
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        assert await robots.is_allowed("https://example.com/anything", enabled=True) is True


@respx.mock
async def test_robots_cache_only_fetches_robots_txt_once_per_domain():
    route = respx.get("https://example.com/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nAllow: /\n")
    )
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        await robots.is_allowed("https://example.com/a", enabled=True)
        await robots.is_allowed("https://example.com/b", enabled=True)
    assert route.call_count == 1


@respx.mock
async def test_robots_cache_returns_advertised_sitemaps():
    respx.get("https://example.com/robots.txt").mock(
        return_value=httpx.Response(
            200,
            text="User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n",
        )
    )
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        sitemaps = await robots.sitemaps_for("https://example.com/page")
    assert sitemaps == ["https://example.com/sitemap.xml"]


@respx.mock
async def test_robots_cache_falls_back_to_conventional_sitemap_path():
    respx.get("https://example.com/robots.txt").mock(
        return_value=httpx.Response(200, text="User-agent: *\nAllow: /\n")
    )
    async with httpx.AsyncClient() as client:
        robots = RobotsCache(client)
        sitemaps = await robots.sitemaps_for("https://example.com/page")
    assert sitemaps == ["https://example.com/sitemap.xml"]


# ─── Domain Scoping & File Classification ──────────────────────

def test_get_effective_allowed_domains_derives_from_start_urls():
    from app.spiders.http_spider import get_effective_allowed_domains, is_downloadable_url

    # When allowed_domains is empty, auto-derives from start_urls hostnames
    derived = get_effective_allowed_domains(["https://lib.kurdish.org/books/index.html"], [])
    assert derived == ["lib.kurdish.org"]

    # When allowed_domains is specified, uses configured allowed_domains
    configured = get_effective_allowed_domains(["https://lib.kurdish.org/books"], ["kurdish.org"])
    assert configured == ["kurdish.org"]


def test_is_downloadable_url_does_not_misclassify_clean_html_permalinks_with_dots():
    from app.spiders.http_spider import is_downloadable_url

    # Clean HTML permalinks containing dots must NOT be marked as downloadable files
    assert is_downloadable_url("https://example.com/article/v1.0", []) is False
    assert is_downloadable_url("https://example.com/item/john.doe", []) is False

    # Target files with real downloadable extensions must be identified correctly
    assert is_downloadable_url("https://example.com/docs/book.pdf", []) is True
    assert is_downloadable_url("https://example.com/data/report.docx", []) is True

    # With allowed_extensions filter configured
    assert is_downloadable_url("https://example.com/docs/book.pdf", [".pdf"]) is True
    assert is_downloadable_url("https://example.com/img/photo.png", [".pdf"]) is False


def test_extract_page_text_extracts_poetry_and_article_body():
    html = """
    <div class="text-container">
        <div id="textbody">
            <div class="textcontent lg rtl">
                <div class="H R">مجمر سینه ز دوریت به تاب است امشب</div>
                <div class="H L">وز غمت صبر به دل نقش بر آب است امشب</div>
            </div>
            <div class="text-nav">
                <a class="prev" href="/prev">Prev</a>
            </div>
        </div>
    </div>
    """
    text = extract_page_text(html)
    assert "مجمر سینه ز دوریت به تاب است امشب" in text
    assert "وز غمت صبر به دل نقش بر آب است امشب" in text
    assert "Prev" not in text


def test_extract_structured_page_data_rejects_low_information_gate_page():
        from app.discovery.extractor import extract_structured_page_data

        page = extract_structured_page_data(
                "<html><head><title>Access denied</title></head><body>Access denied</body></html>",
                "https://example.com/private",
        )

        assert page["is_usable"] is False
        assert page["quality"]["reason"] == "too_short"


def test_extract_structured_page_data_is_versioned_and_structured():
        from app.discovery.extractor import extract_structured_page_data

        html = """
        <html lang="ku"><head><title>Research Report</title>
            <meta name="description" content="A useful report">
        </head><body><main><h1>Research Report</h1>
            <p>This is a useful research report with enough text for quality filtering and search.</p>
            <p>It contains stable information that should be retained for knowledge extraction.</p>
        </main></body></html>
        """
        page = extract_structured_page_data(html, "https://sub.example.com/reports/item#section")

        assert page["schema_version"] == "web_page.v2"
        assert page["record_type"] == "web_page"
        assert page["is_usable"] is True
        assert page["canonical_url"] == "https://sub.example.com/reports/item"
        assert page["source_domain"] == "example.com"
        assert page["source_subdomain"] == "sub"
        assert page["source_route"] == "/reports/item"
        assert len(page["content_fingerprint"]) == 64
        assert page["quality"]["word_count"] == page["word_count"]


def test_extract_page_text_removes_duplicate_lines():
        html = """
        <main><p>Repeated content should appear once.</p>
            <p>Repeated content should appear once.</p>
            <p>Unique content remains available.</p></main>
        """

        text = extract_page_text(html)

        assert text.count("Repeated content should appear once.") == 1
        assert "Unique content remains available." in text


