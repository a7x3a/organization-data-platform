"""Build the canonical structured document export for processed text."""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Optional
from urllib.parse import urlparse

from app.media.kurdish_decoder import normalize_arabic_to_kurdish_unicode


def _paragraphs(text: str) -> list[str]:
    paragraphs: list[str] = []
    seen: set[str] = set()
    for block in re.split(r"\n\s*\n+", text):
        clean = re.sub(r"\s+", " ", block).strip()
        if clean and clean not in seen:
            seen.add(clean)
            paragraphs.append(clean)
    return paragraphs


def _source_domain(url: str) -> tuple[str, str, str]:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    parts = hostname.split(".")
    domain = ".".join(parts[-2:]) if len(parts) >= 2 else hostname
    subdomain = ".".join(parts[:-2]) if len(parts) > 2 else ""
    return domain, subdomain, parsed.path or "/"


def build_structured_document(
    *,
    document_id: str,
    source_name: str,
    source_url: str,
    file_path: str,
    title: str,
    raw_text: str,
    language: Optional[dict[str, Any]] = None,
    quality: Optional[dict[str, Any]] = None,
    conversion: Optional[dict[str, Any]] = None,
    document_type: str = "document",
) -> dict[str, Any]:
    """Return a stable export shape without inventing unsupported facts."""
    raw_text = raw_text or ""
    converted_text = normalize_arabic_to_kurdish_unicode(raw_text)
    normalized_text = unicodedata.normalize("NFC", converted_text)
    paragraphs = _paragraphs(normalized_text)
    lang = language or {}
    lang_code = str(lang.get("language") or "unknown")
    script = str(lang.get("script") or "unknown")
    is_rtl = bool(lang.get("is_rtl", script == "arabic"))
    domain, subdomain, route = _source_domain(source_url)
    conversion_info = conversion or {
        "encoding_type": "unicode_normalized",
        "conversion_confidence": 1.0 if raw_text == normalized_text else 0.95,
        "normalization": "unicode_nfc",
    }
    quality_info = quality or {
        "text_quality": "verified" if normalized_text else "rejected",
        "conversion_verified": bool(normalized_text),
        "language_verified": lang_code != "unknown" and float(lang.get("confidence", 0)) >= 0.8,
        "structure_verified": bool(paragraphs),
    }
    if lang_code == "ckb":
        dialect = "sorani"
    elif lang_code == "kmr":
        dialect = "kurmanji"
    else:
        dialect = "unknown"

    return {
        "schema_version": "structured_document.v1",
        "id": document_id,
        "source": {
            "publisher": source_name,
            "url": source_url,
            "domain": domain,
            "subdomain": subdomain,
            "route": route,
            "file_path": file_path,
        },
        "document": {
            "title": title or "",
            "document_type": document_type,
            "language": lang_code,
            "dialect": dialect,
            "script": script,
            "direction": "rtl" if is_rtl else "ltr",
        },
        "text": {
            "raw_text": raw_text,
            "converted_text": converted_text,
            "normalized_text": normalized_text,
            "primary_text": normalized_text,
            "primary_text_source": "normalized_text",
            "paragraphs": paragraphs,
        },
        "conversion": conversion_info,
        "structure": {
            "paragraph_count": len(paragraphs),
            "word_count": len(normalized_text.split()),
            "char_count": len(normalized_text),
        },
        "quality": quality_info,
    }