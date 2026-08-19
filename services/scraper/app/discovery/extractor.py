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
from typing import Any
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
    # Standard media tags
    ("img", "src"),
    ("img", "srcset"),
    ("source", "src"),
    ("source", "srcset"),
    ("video", "src"),
    ("video", "poster"),
    ("audio", "src"),
    ("iframe", "src"),
    ("embed", "src"),
    ("object", "data"),

    # SVG & Form inputs
    ("image", "href"),
    ("use", "href"),
    ("input[type='image']", "src"),

    # Link elements (enclosures, feeds, preloaded images/videos, canonical images)
    ("link", "href"),

    # OpenGraph, Twitter Cards & Schema.org / Microdata meta tags
    ("meta[property='og:image']", "content"),
    ("meta[property='og:image:secure_url']", "content"),
    ("meta[property='og:video']", "content"),
    ("meta[name='twitter:image']", "content"),
    ("meta[name='twitter:image:src']", "content"),
    ("meta[itemprop='image']", "content"),
    ("meta[itemprop='thumbnailUrl']", "content"),
    ("meta[itemprop='contentUrl']", "content"),

    # Lazy-load data attributes
    ("[data-src]", "data-src"),
    ("[data-srcset]", "data-srcset"),
    ("[data-original]", "data-original"),
    ("[data-lazy-src]", "data-lazy-src"),
    ("[data-lazy]", "data-lazy"),
    ("[data-lazysrc]", "data-lazysrc"),
    ("[data-lazy-srcset]", "data-lazy-srcset"),
    ("[data-original-src]", "data-original-src"),
    ("[data-fallback-src]", "data-fallback-src"),
    ("[data-echo-src]", "data-echo-src"),
    ("[data-cfsrc]", "data-cfsrc"),

    # Image-specific data attributes
    ("[data-image]", "data-image"),
    ("[data-img]", "data-img"),
    ("[data-img-url]", "data-img-url"),
    ("[data-image-url]", "data-image-url"),
    ("[data-full]", "data-full"),
    ("[data-full-url]", "data-full-url"),
    ("[data-thumb]", "data-thumb"),
    ("[data-thumbnail]", "data-thumbnail"),
    ("[data-zoom-src]", "data-zoom-src"),
    ("[data-zoom-image]", "data-zoom-image"),
    ("[data-lightbox-src]", "data-lightbox-src"),
    ("[data-mfp-src]", "data-mfp-src"),

    # Background-image data attributes
    ("[data-bg]", "data-bg"),
    ("[data-bgimage]", "data-bgimage"),
    ("[data-bg-img]", "data-bg-img"),
    ("[data-bg-src]", "data-bg-src"),
    ("[data-background]", "data-background"),
    ("[data-background-image]", "data-background-image"),

    # Document & CMS data attributes
    ("[data-file]", "data-file"),
    ("[data-download]", "data-download"),
    ("[data-url]", "data-url"),
    ("[data-document-url]", "data-document-url"),
    ("[data-media-id]", "data-media-id"),
    ("[data-uri]", "data-uri"),
    ("[data-wix-media-id]", "data-wix-media-id"),
]

_ENCLOSURE_RELS = {"alternate", "enclosure"}
_STYLE_BG_URL_RE = re.compile(r'url\([\'"]?(.*?)[\'"]?\)', re.IGNORECASE)


def extract_page_links(html: str, base_url: str) -> set[str]:
    """
    Every <a href> target on the page, resolved to an absolute URL.
    Also includes <form action="..."> targets, <iframe src="..."> embed URLs,
    and interactive dynamic element links ([data-href], [data-url], [onclick]).
    """
    tree = HTMLParser(html)
    links: set[str] = set()

    # 1. Standard <a href> anchors
    for node in tree.css("a[href]"):
        href = node.attributes.get("href")
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#", "data:")):
            continue
        links.add(urljoin(base_url, href))

    # 2. Dynamic Attributes ([data-href], [data-url], [data-link], [data-document-url])
    for attr in ("data-href", "data-url", "data-link", "data-document-url", "data-uri"):
        for node in tree.css(f"[{attr}]"):
            val = node.attributes.get(attr)
            if val and not val.startswith(("javascript:", "mailto:", "tel:", "#", "data:")):
                if val.startswith("ugd/") or "usrfiles.com" in val:
                    if not val.startswith("http"):
                        val = f"https://usrfiles.com/{val.lstrip('/')}"
                links.add(urljoin(base_url, val))

    # 3. Form action targets (<form action="...">)
    for node in tree.css("form[action]"):
        action = node.attributes.get("action")
        if action and not action.startswith(("javascript:", "#", "data:")):
            links.add(urljoin(base_url, action))

    # 4. Iframe & Embed sources (<iframe src="...">, <embed src="...">)
    for node in tree.css("iframe[src], embed[src], frame[src]"):
        src = node.attributes.get("src")
        if src and not src.startswith(("javascript:", "#", "data:")):
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


# Known Vercel storage CDN host for ktebstan
_KTEBSTAN_VERCEL_BLOB_BASE = "https://z4l1g0tev5tfrvnx.public.blob.vercel-storage.com/"
_WIX_USRFILES_BASE = "https://usrfiles.com/"

_KNOWN_JSON_URL_KEYS = {
    "file_url", "pdf_url", "download_url", "audio_file_url", "url", "file", "path",
    "src", "link", "cover_image_url", "documenturl", "mediaid", "uri", "originalfilename",
    "image", "thumbnailurl", "contenturl", "logo", "screenshot", "haspart"
}


def extract_urls_from_json_data(data: str | bytes | dict | list, base_url: str) -> set[str]:
    """
    Recursively extract file and media resource URLs from parsed JSON payloads or JSON strings.
    Handles relative paths, CDN absolute URLs, Vercel Blob Storage, JSON-LD schema keys, and Wix document IDs (ugd/...).
    """
    import json
    urls: set[str] = set()

    if isinstance(data, bytes):
        try:
            data = data.decode("utf-8", errors="ignore")
        except Exception:
            return urls

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return urls

    def _traverse(obj: Any) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str) and v.strip():
                    val = v.strip()
                    if val.startswith("data:"):
                        continue
                    # Handle Wix uri / mediaId / documentUrl schemes (e.g. ugd/7c8d9e_12345.pdf or wix:document://...)
                    if "wix:document" in val or val.startswith("ugd/") or (isinstance(val, str) and "/ugd/" in val):
                        clean_wix = re.sub(r"^wix:document://v1/", "", val).lstrip("/")
                        if clean_wix.startswith("ugd/"):
                            urls.add(urljoin(_WIX_USRFILES_BASE, clean_wix))
                    
                    # If it's a known URL or file path key
                    if k.lower() in _KNOWN_JSON_URL_KEYS:
                        if val.startswith(("http://", "https://")):
                            urls.add(val)
                        elif val.startswith("ugd/"):
                            urls.add(urljoin(_WIX_USRFILES_BASE, val))
                        elif val.endswith((".pdf", ".epub", ".mobi", ".azw3", ".mp3", ".docx", ".xlsx", ".zip", ".rar")):
                            urls.add(urljoin(base_url, val))
                _traverse(v)
        elif isinstance(obj, list):
            for item in obj:
                _traverse(item)

    _traverse(data)
    return urls


def extract_resource_urls(html: str | bytes, base_url: str) -> set[str]:
    """
    Every non-<a> resource URL a page can point to: images, video/audio
    sources, embedded objects, alternate/enclosure links, plus URLs found in
    inline <script> bodies, inline CSS style background images, JSON-LD blocks, and embedded JSON API data.
    """
    if isinstance(html, bytes):
        html = html.decode("utf-8", errors="ignore")

    tree = HTMLParser(html)
    resources: set[str] = set()

    for tag, attr in _MEDIA_SELECTORS:
        for node in tree.css(tag):
            if tag == "link":
                rel = (node.attributes.get("rel") or "").strip().lower()
                as_attr = (node.attributes.get("as") or "").strip().lower()
                if rel not in _ENCLOSURE_RELS and as_attr not in ("image", "video", "media", "document") and "image_src" not in rel:
                    continue
            value = node.attributes.get(attr)
            if not value or value.startswith("data:"):
                continue
            for candidate in value.split(","):
                url_part = candidate.strip().split(" ")[0]
                if url_part and not url_part.startswith("data:"):
                    if url_part.startswith("ugd/") or "usrfiles.com" in url_part:
                        if not url_part.startswith("http"):
                            url_part = f"https://usrfiles.com/{url_part.lstrip('/')}"
                    resources.add(urljoin(base_url, url_part))

    # Extract inline style="background-image: url(...)"
    for node in tree.css("[style*='url']"):
        style_val = node.attributes.get("style") or ""
        if isinstance(style_val, bytes):
            style_val = style_val.decode("utf-8", errors="ignore")
        for bg_match in _STYLE_BG_URL_RE.findall(style_val):
            bg_url = bg_match.strip()
            if bg_url and not bg_url.startswith("data:"):
                resources.add(urljoin(base_url, bg_url))

    for node in tree.css("script"):
        body = node.text() or ""
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="ignore")
        for match in _INLINE_URL_RE.finditer(body):
            resources.add(match.group(0))

        # Check for Wix document ugd/ patterns in script text
        for wix_match in re.finditer(r'["\'](ugd/[a-zA-Z0-9_-]+\.(?:pdf|epub|mobi|docx|xlsx|zip|mp3|rar))["\']', body, re.IGNORECASE):
            resources.add(f"https://usrfiles.com/{wix_match.group(1)}")

        if "{" in body or "[" in body:
            resources.update(extract_urls_from_json_data(body, base_url))

    return resources



_SITEMAP_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.IGNORECASE)


def extract_sitemap_locs(xml_text: str | bytes) -> list[str]:
    """Extract <loc> entries from a sitemap.xml body."""
    if isinstance(xml_text, bytes):
        xml_text = xml_text.decode("utf-8", errors="ignore")
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

