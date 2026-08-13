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
