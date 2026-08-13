"""
HTML/XML resource discovery — link, media, and sitemap extraction.

Built on selectolax (a thin binding over the Modest HTML engine) instead of
Scrapy's LinkExtractor: Scrapy is a full crawling framework (Twisted reactor,
its own Spider/Request/Response classes, item pipelines) that this project
never actually used — only LinkExtractor and HtmlResponse were ever imported
from it, to pull links out of a page. Pulling in Twisted + parsel + w3lib +
queuelib + protego as transitive weight for two helper classes was dead
weight; selectolax is a single small, fast (C-based) parser that does the
same job, plus the media/JSON extraction this module adds on top.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin

from selectolax.parser import HTMLParser

# Absolute-URL sweep over inline <script>/JSON-LD bodies — deliberately
# conservative (http(s) + a real, known document/media extension) so it
# catches "download" links a site renders via JS or embeds in a JSON-LD
# dataset description, without pulling in noise like analytics beacons or
# JS chunk URLs that also live inside <script> tags.
_INLINE_URL_RE = re.compile(
    r"https?://[^\s\"'<>\\]+?\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|odp|epub|mobi|"
    r"azw3|zip|rar|7z|tar|gz|mp3|mp4|wav|flac|ogg|opus|mkv|webm|mov|avi|jpg|"
    r"jpeg|png|gif|webp|svg|csv|json|jsonl|xml|txt|srt|vtt|parquet|tsv)"
    r"(?=[\"'<>\s\\]|$)",
    re.IGNORECASE,
)

# (tag, attribute) pairs checked for embedded resource URLs — everything a
# page can point to besides a plain <a href>. `link` is filtered to
# rel=alternate/enclosure below (those carry real resource URLs; other
# `link` rels like stylesheet/icon are page furniture, not content).
_MEDIA_SELECTORS = [
    ("img", "src"),
    ("img", "data-src"),  # common lazy-load pattern
    ("img", "srcset"),  # comma-separated "url descriptor" pairs — split below
    ("source", "src"),
    ("source", "srcset"),  # <picture><source srcset=...> responsive markup
    ("video", "src"),
    ("audio", "src"),
    ("embed", "src"),
    ("object", "data"),
    ("link", "href"),
]

_ENCLOSURE_RELS = {"alternate", "enclosure"}


def extract_page_links(html: str, base_url: str) -> set[str]:
    """
    Every <a href> target on the page, resolved to an absolute URL.

    Deliberately makes no page-vs-file distinction here — that classification
    already happens downstream (is_downloadable_url), same as the original
    scrapy-based extractor's deny_extensions=() behavior.
    """
    tree = HTMLParser(html)
    links: set[str] = set()
    for node in tree.css("a[href]"):
        href = node.attributes.get("href")
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        links.add(urljoin(base_url, href))
    return links


def extract_resource_urls(html: str, base_url: str) -> set[str]:
    """
    Every non-<a> resource URL a page can point to: images, video/audio
    sources, embedded objects, alternate/enclosure links, plus URLs found in
    inline <script> bodies and JSON-LD blocks. This is what catches files a
    site links via a JS-rendered "Download" button or a <link rel=enclosure>
    feed entry instead of a plain anchor — most of what "find every file
    type inside an article/research page" actually requires.
    """
    tree = HTMLParser(html)
    resources: set[str] = set()

    for tag, attr in _MEDIA_SELECTORS:
        for node in tree.css(tag):
            if tag == "link":
                rel = (node.attributes.get("rel") or "").strip().lower()
                if rel not in _ENCLOSURE_RELS:
                    continue
            value = node.attributes.get(attr)
            if not value:
                continue
            # srcset-style attributes hold comma-separated "url descriptor"
            # pairs (e.g. "a.jpg 1x, b.jpg 2x") — split() also safely handles
            # the common single-URL case since it's a no-op there.
            for candidate in value.split(","):
                url_part = candidate.strip().split(" ")[0]
                if url_part:
                    resources.add(urljoin(base_url, url_part))

    for node in tree.css("script"):
        body = node.text() or ""
        for match in _INLINE_URL_RE.finditer(body):
            resources.add(match.group(0))

    return resources


_SITEMAP_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.IGNORECASE)


def extract_sitemap_locs(xml_text: str) -> list[str]:
    """
    Extract <loc> entries from a sitemap.xml or sitemap-index.xml body.

    Regex-based rather than a full XML parser deliberately — sitemap <loc>
    entries are a simple, well-known structure, and this avoids adding an XML
    dependency on top of selectolax for HTML.
    """
    return _SITEMAP_LOC_RE.findall(xml_text)
