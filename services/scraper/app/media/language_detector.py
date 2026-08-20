"""
Language Detection Module for Kurdish, Arabic, English, Turkish, Farsi content.

Uses Unicode script analysis for fast detection + langdetect for disambiguation.
Kurdish (Sorani) is detected via unique characters not found in Arabic.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import structlog

log = structlog.get_logger(__name__)

# Kurdish-specific characters (Sorani) — these exist in Kurdish but NOT in standard Arabic
_KURDISH_CHARS = frozenset("ەێۆڕڵڤگکیانۆۆو")

# Arabic script Unicode block ranges
_ARABIC_RANGES = (
    (0x0600, 0x06FF),   # Arabic
    (0x0750, 0x077F),   # Arabic Supplement
    (0x08A0, 0x08FF),   # Arabic Extended-A
    (0xFB50, 0xFDFF),   # Arabic Presentation Forms-A
    (0xFE70, 0xFEFF),   # Arabic Presentation Forms-B
)

# Latin script ranges
_LATIN_RANGES = (
    (0x0041, 0x005A),   # A-Z
    (0x0061, 0x007A),   # a-z
    (0x00C0, 0x024F),   # Latin Extended
)

# Cyrillic range
_CYRILLIC_RANGES = ((0x0400, 0x04FF),)

# Devanagari range (Hindi/Urdu)
_DEVANAGARI_RANGES = ((0x0900, 0x097F),)

# Minimum text length for reliable detection
_MIN_TEXT_LENGTH = 20


def _count_chars_in_ranges(text: str, ranges: tuple[tuple[int, int], ...]) -> int:
    """Count characters falling within Unicode ranges."""
    count = 0
    for ch in text:
        cp = ord(ch)
        for start, end in ranges:
            if start <= cp <= end:
                count += 1
                break
    return count


def _has_kurdish_chars(text: str) -> bool:
    """Check for Kurdish-specific characters not found in standard Arabic."""
    for ch in text:
        if ch in _KURDISH_CHARS:
            return True
    return False


@dataclass
class LanguageResult:
    language: str          # ISO 639-3 code: ckb, ar, en, tr, fa, ku, unknown
    confidence: float      # 0.0 to 1.0
    script: str            # arabic, latin, cyrillic, devanagari, mixed
    is_rtl: bool           # Right-to-left script
    language_name: str     # Human-readable name

    def to_dict(self) -> dict:
        return {
            "language": self.language,
            "confidence": round(self.confidence, 3),
            "script": self.script,
            "is_rtl": self.is_rtl,
            "language_name": self.language_name,
        }


# Language name mapping
_LANG_NAMES = {
    "ckb": "Central Kurdish (Sorani)",
    "ku": "Kurdish",
    "ar": "Arabic",
    "en": "English",
    "tr": "Turkish",
    "fa": "Persian (Farsi)",
    "ur": "Urdu",
    "he": "Hebrew",
    "unknown": "Unknown",
}


def detect_language(text: str) -> LanguageResult:
    """
    Detect the language of input text.

    Strategy:
    1. Unicode script analysis (fast, no dependencies)
    2. Kurdish-specific character detection
    3. langdetect fallback for disambiguation
    """
    if not text or not text.strip():
        return LanguageResult(
            language="unknown",
            confidence=0.0,
            script="unknown",
            is_rtl=False,
            language_name="Unknown",
        )

    clean_text = text.strip()

    # Script-level analysis
    arabic_count = _count_chars_in_ranges(clean_text, _ARABIC_RANGES)
    latin_count = _count_chars_in_ranges(clean_text, _LATIN_RANGES)
    cyrillic_count = _count_chars_in_ranges(clean_text, _CYRILLIC_RANGES)
    devanagari_count = _count_chars_in_ranges(clean_text, _DEVANAGARI_RANGES)
    total_chars = len(clean_text)

    if total_chars == 0:
        return LanguageResult("unknown", 0.0, "unknown", False, "Unknown")

    arabic_ratio = arabic_count / total_chars
    latin_ratio = latin_count / total_chars
    cyrillic_ratio = cyrillic_count / total_chars
    devanagari_ratio = devanagari_count / total_chars

    # Determine dominant script
    script = "unknown"
    is_rtl = False
    if arabic_ratio > 0.3:
        script = "arabic"
        is_rtl = True
    elif latin_ratio > 0.3:
        script = "latin"
    elif cyrillic_ratio > 0.3:
        script = "cyrillic"
    elif devanagari_ratio > 0.3:
        script = "devanagari"
    elif arabic_ratio > 0.1 and latin_ratio > 0.1:
        script = "mixed"

    # Kurdish vs Arabic disambiguation
    if script == "arabic" or arabic_ratio > 0.2:
        if _has_kurdish_chars(clean_text):
            return LanguageResult(
                language="ckb",
                confidence=0.85,
                script="arabic",
                is_rtl=True,
                language_name=_LANG_NAMES["ckb"],
            )
        # Arabic detected — but could be Farsi/Urdu
        # Try langdetect for finer classification
        try:
            from langdetect import detect as ld_detect, DetectorFactory
            DetectorFactory.seed = 0  # Reproducible results
            detected = ld_detect(clean_text)
            if detected in _LANG_NAMES:
                confidence = 0.75
                # Boost confidence if script analysis agrees
                if detected in ("ar", "ckb", "fa", "ur") and arabic_ratio > 0.3:
                    confidence = 0.85
                return LanguageResult(
                    language=detected,
                    confidence=confidence,
                    script="arabic",
                    is_rtl=True,
                    language_name=_LANG_NAMES.get(detected, detected),
                )
        except Exception:
            pass

        # Fallback: Arabic
        return LanguageResult(
            language="ar",
            confidence=0.7,
            script="arabic",
            is_rtl=True,
            language_name=_LANG_NAMES["ar"],
        )

    # Latin script — use langdetect
    if script == "latin" and latin_ratio > 0.3:
        try:
            from langdetect import detect as ld_detect, DetectorFactory
            DetectorFactory.seed = 0
            detected = ld_detect(clean_text)
            if detected in _LANG_NAMES:
                confidence = 0.8
                return LanguageResult(
                    language=detected,
                    confidence=confidence,
                    script="latin",
                    is_rtl=False,
                    language_name=_LANG_NAMES.get(detected, detected),
                )
        except Exception:
            pass

        # Fallback: English
        return LanguageResult(
            language="en",
            confidence=0.6,
            script="latin",
            is_rtl=False,
            language_name=_LANG_NAMES["en"],
        )

    # Cyrillic script
    if script == "cyrillic":
        try:
            from langdetect import detect as ld_detect, DetectorFactory
            DetectorFactory.seed = 0
            detected = ld_detect(clean_text)
            return LanguageResult(
                language=detected,
                confidence=0.75,
                script="cyrillic",
                is_rtl=False,
                language_name=_LANG_NAMES.get(detected, detected),
            )
        except Exception:
            pass

    return LanguageResult(
        language="unknown",
        confidence=0.0,
        script=script if script != "unknown" else "mixed",
        is_rtl=False,
        language_name="Unknown",
    )


def extract_text_from_file(file_path: str, mime_type: Optional[str] = None) -> str:
    """
    Extract readable text from a file for language detection.
    Supports PDF, EPUB, DOCX, TXT, and other text-based formats.
    """
    import os

    ext = os.path.splitext(file_path)[1].lower()

    # PDF extraction
    if ext == ".pdf" or (mime_type and "pdf" in mime_type):
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            pages = []
            for page in reader.pages[:10]:  # Sample first 10 pages
                try:
                    text = page.extract_text()
                    if text:
                        pages.append(text)
                except Exception:
                    continue
            return "\n".join(pages)
        except Exception:
            pass

    # EPUB extraction
    if ext == ".epub" or (mime_type and "epub" in mime_type):
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(file_path, "r") as z:
                if "META-INF/container.xml" in z.namelist():
                    container = ET.fromstring(z.read("META-INF/container.xml"))
                    rootfile = container.find(".//{*}rootfile")
                    if rootfile is not None:
                        opf_path = rootfile.attrib.get("full-path")
                        if opf_path and opf_path in z.namelist():
                            opf = ET.fromstring(z.read(opf_path))
                            texts = []
                            for item in opf.findall(".//{*}item"):
                                href = item.attrib.get("href")
                                if href and href.endswith((".html", ".xhtml", ".htm")):
                                    full_path = os.path.join(os.path.dirname(opf_path), href)
                                    if full_path in z.namelist():
                                        content = z.read(full_path).decode("utf-8", errors="ignore")
                                        # Strip HTML tags
                                        clean = re.sub(r"<[^>]+>", " ", content)
                                        texts.append(clean)
                            return " ".join(texts)[:5000]
        except Exception:
            pass

    # DOCX extraction
    if ext == ".docx" or (mime_type and "wordprocessingml" in (mime_type or "")):
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(file_path, "r") as z:
                if "word/document.xml" in z.namelist():
                    doc = ET.fromstring(z.read("word/document.xml"))
                    texts = []
                    for para in doc.findall(".//{*}p"):
                        for run in para.findall(".//{*}t"):
                            if run.text:
                                texts.append(run.text)
                    return " ".join(texts)[:5000]
        except Exception:
            pass

    # Plain text / markdown / other text files
    if ext in (".txt", ".md", ".rst", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".html", ".htm"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read(5000)
        except Exception:
            pass

    return ""
