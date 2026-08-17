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
    Also includes <form action="..."> targets and <iframe src="..."> embed URLs.
    """
    tree = HTMLParser(html)
    links: set[str] = set()

    # 1. Standard <a href> anchors
    for node in tree.css("a[href]"):
        href = node.attributes.get("href")
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        links.add(urljoin(base_url, href))

    # 2. Form action targets (<form action="...">)
    for node in tree.css("form[action]"):
        action = node.attributes.get("action")
        if action and not action.startswith(("javascript:", "#")):
            links.add(urljoin(base_url, action))

    # 3. Iframe & Embed sources (<iframe src="...">, <embed src="...">)
    for node in tree.css("iframe[src], embed[src]"):
        src = node.attributes.get("src")
        if src and not src.startswith(("javascript:", "#")):
            links.add(urljoin(base_url, src))

    return links


def extract_html_metadata(html: str, url: str) -> dict[str, str]:
    """
    Extract rich structured book & document metadata from page HTML:
    - Page Title (OpenGraph, Dublin Core, <title>)
    - Author / Creator (DC.creator, citation_author, meta author)
    - Description (og:description, description)
    - JSON-LD Book / Article schema fields
    """
    tree = HTMLParser(html)
    meta_data: dict[str, str] = {}

    # Extract Title
    og_title = tree.css_first("meta[property='og:title']")
    dc_title = tree.css_first("meta[name='DC.title'], meta[name='citation_title']")
    title_node = tree.css_first("title")

    if og_title and og_title.attributes.get("content"):
        meta_data["title"] = og_title.attributes["content"].strip()
    elif dc_title and dc_title.attributes.get("content"):
        meta_data["title"] = dc_title.attributes["content"].strip()
    elif title_node and title_node.text():
        meta_data["title"] = title_node.text().strip()

    # Extract Author
    author_node = tree.css_first("meta[name='author'], meta[name='DC.creator'], meta[name='citation_author']")
    if author_node and author_node.attributes.get("content"):
        meta_data["author"] = author_node.attributes["content"].strip()

    # Extract Description
    desc_node = tree.css_first("meta[name='description'], meta[property='og:description']")
    if desc_node and desc_node.attributes.get("content"):
        meta_data["description"] = desc_node.attributes["content"].strip()

    # Extract Language
    lang_node = tree.css_first("html[lang]")
    if lang_node and lang_node.attributes.get("lang"):
        meta_data["language"] = lang_node.attributes["lang"].strip()

    return meta_data


def extract_resource_urls(html: str, base_url: str) -> set[str]:
    """
    Every non-<a> resource URL a page can point to: images, video/audio
    sources, embedded objects, alternate/enclosure links, plus URLs found in
    inline <script> bodies and JSON-LD blocks.
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
    """Extract <loc> entries from a sitemap.xml body."""
    return _SITEMAP_LOC_RE.findall(xml_text)


_IGNORE_TAGS = {"script", "style", "noscript", "iframe", "svg", "header", "footer", "nav", "style"}


def extract_page_text(html: str) -> str:
    """
    Extract clean, readable, meaningful body text from an HTML document.

    Handles:
    - Standard paragraphs (<p>), headings (<h1>-<h6>), blockquotes, lists.
    - Custom text containers (<div class="textcontent">, <article>, #textbody, .post-body, etc.).
    - RTL text (Persian, Kurdish, Arabic) and poetry lines (<div class="H R">, <div class="H L">).
    - Ignores page furniture (scripts, styles, navigation bars, footers).
    """
    tree = HTMLParser(html)

    # 1. Remove unwanted furniture tags
    for tag in _IGNORE_TAGS:
        for node in tree.css(tag):
            node.decompose()

    for node in tree.css(".text-nav, .nav, .footer, .header, .sidebar, .menu"):
        node.decompose()

    # 2. Prefer specific main text containers if present
    main_node = None
    for selector in [
        "#textbody", ".textcontent", "article", "main",
        ".post-content", ".entry-content", ".article-body", ".text-container"
    ]:
        found = tree.css_first(selector)
        if found:
            main_node = found
            break

    root = main_node or tree.body or tree.root
    if not root:
        return ""

    lines: list[str] = []

    # 3. Extract text from leaf/block elements recursively
    for node in root.traverse():
        if node.tag in ("script", "style", "option", "button"):
            continue
        text = node.text(deep=False)
        if text:
            clean = " ".join(text.split())
            if clean and len(clean) > 0:
                # Avoid duplicate lines from nested container nodes
                if not lines or lines[-1] != clean:
                    lines.append(clean)

    return "\n".join(lines)

