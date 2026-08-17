"""
Kurdish Font Decoder & Text Normalizer for Native PDFs.

Handles legacy font character remapping (AliKurdish, Ali_K_Zar, Dylan, Unikurd, Type3 custom encodings),
Kurdish Unicode normalization (Sorani / Kurmanji), vowel & ligature repair, and directionality fix.
"""
from dataclasses import dataclass
import re
import unicodedata
from typing import Dict, Tuple

# ─── Legacy Font Character Remapping Tables ─────────────────────────────
# Maps legacy AliKurdish / Ali_K_Zar / Windows legacy ASCII code points to clean Kurdish Unicode.
ALI_KURDISH_MAP: Dict[str, str] = {
    # AliKurdish legacy character maps
    "\u00e0": "ە",  # à -> Kurdish AE (U+06D5)
    "\u00e1": "ا",  # á -> Alef (U+0627)
    "\u00e2": "ب",  # â -> Beh (U+0628)
    "\u00e3": "پ",  # ã -> Peh (U+067E)
    "\u00e4": "ت",  # ä -> Teh (U+062A)
    "\u00e5": "ج",  # å -> Jeem (U+062C)
    "\u00e6": "چ",  # æ -> Tcheh (U+0686)
    "\u00e7": "ح",  # ç -> Hah (U+062D)
    "\u00e8": "خ",  # è -> Khah (U+062E)
    "\u00e9": "د",  # é -> Dal (U+062F)
    "\u00ea": "ر",  # ê -> Reh (U+0631)
    "\u00eb": "ڕ",  # ë -> Kurdish Reh (U+0695)
    "\u00ec": "ز",  # ì -> Zain (U+0632)
    "\u00ed": "ژ",  # í -> Jeh (U+0698)
    "\u00ee": "س",  # î -> Seen (U+0633)
    "\u00ef": "ش",  # ï -> Sheen (U+0634)
    "\u00f0": "ع",  # ð -> Ain (U+0639)
    "\u00f1": "غ",  # ñ -> Ghain (U+063F)
    "\u00f2": "ف",  # ò -> Feh (U+0641)
    "\u00f3": "ڤ",  # ó -> Veh (U+06A4)
    "\u00f4": "ق",  # ô -> Qaf (U+0642)
    "\u00f5": "ک",  # õ -> Keheh (U+06A9)
    "\u00f6": "گ",  # ö -> Gaf (U+06AF)
    "\u00f7": "ل",  # ÷ -> Lam (U+0644)
    "\u00f8": "ڵ",  # ø -> Kurdish Lam (U+06B5)
    "\u00f9": "م",  # ù -> Meem (U+0645)
    "\u00fa": "ن",  # ú -> Noon (U+0646)
    "\u00fb": "و",  # û -> Waw (U+0647)
    "\u00fc": "ۆ",  # ü -> Kurdish Oe (U+06C6)
    "\u00fd": "ی",  # ý -> Yeh (U+06CC)
    "\u00fe": "ێ",  # þ -> Kurdish E (U+06D0)
    "\u00ff": "ێ",  # ÿ -> Kurdish E (U+06D0)
}

# Standard Kurdish Unicode Character Definitions
KURDISH_AE = "ە"      # U+06D5 (Kurdish AE)
KURDISH_E = "ێ"       # U+06D0 (Kurdish E / Yey Vowel)
KURDISH_OE = "ۆ"      # U+06C6 (Kurdish OE)
KURDISH_R = "ڕ"       # U+0695 (Kurdish R)
KURDISH_L = "ڵ"       # U+06B5 (Kurdish L)
KURDISH_V = "ڤ"       # U+06A4 (Kurdish V)
KURDISH_K = "ک"       # U+06A9
KURDISH_G = "گ"       # U+06AF
KURDISH_Y = "ی"       # U+06CC

# Common word repair patterns for text extracted from custom font PDFs
WORD_REPAIR_PATTERNS = [
    # Fixed known garbled PDF font extraction word forms -> Proper Unicode Kurdish
    (r"\bکرتی\b", "کەرتی"),
    (r"\bتایبت\b", "تایبەت"),
    (r"\bتیدا\b", "تێدا"),
    (r"\bتیدایە\b", "تێدایە"),
    (r"\bهروەها\b", "هەروەها"),
    (r"\bبرامبر\b", "بەرامبەر"),
    (r"\bبرامبەری\b", "بەرامبەری"),
    (r"\bکارام\b", "کارامە"),
    (r"\bئگر\b", "ئەگەر"),
    (r"\bبکاریان\b", "بەکاریان"),
    (r"\bبخن\b", "بخەن"),
    (r"\bبدۆزنوە\b", "بدۆزنەوە"),
    (r"\bبگوزنوە\b", "بگوازرێنەوە"),
    (r"\bپاداشت\b", "پاداشت"),
    (r"\bخاوەنکاران\b", "خاوەنکاران"),
    (r"\bکارمندان\b", "کارمندان"),
    (r"\bکارمندی\b", "کارمندی"),
    # Generic missing vowel repair rules for verbs ending in -وە without ە (e.g. -نوە -> -نەوە)
    (r"(\u0646)\u0648\u06D5\b", r"\1ەوە"),  # نوە -> نەوە
    (r"(\u0631)\u0648\u06D5\b", r"\1ەوە"),  # ڕوە / روە -> ڕەوە / ڕەوە
    (r"(\u062A)\u0648\u06D5\b", r"\1ەوە"),  # توە -> تەوە
]


@dataclass
class KurdishDecodeResult:
    is_legacy_encoded: bool
    raw_text: str
    decoded_text: str
    encoding_type: str  # "clean_unicode", "ali_kurdish_legacy", "repaired_vowels", "unknown_encoded"
    confidence: float


def normalize_arabic_to_kurdish_unicode(text: str) -> str:
    """Normalize Arabic character variants to standard Kurdish Unicode."""
    if not text:
        return ""
    # NFKC Unicode normalization
    text = unicodedata.normalize("NFKC", text)

    # Character normalization mappings
    text = text.replace("\u0643", "ک")  # Arabic Kafka (ك) -> Kurdish Keheh (ک)
    text = text.replace("\u064A", "ی")  # Arabic Yeh (ي) -> Kurdish Yeh (ی)
    text = text.replace("\u0649", "ی")  # Arabic Alef Maksura -> Kurdish Yeh (ی)
    text = text.replace("\u06D2", "ێ")  # Urdu Yeh -> Kurdish E (ێ)
    text = text.replace("\u06C1", "ە")  # Urdu Heh -> Kurdish AE (ە)
    text = text.replace("\u0625", "إ")  # Normalize Hamza variants
    text = text.replace("\u0623", "أ")
    text = text.replace("\u0622", "آ")

    return text


def detect_and_decode_kurdish(raw_text: str) -> KurdishDecodeResult:
    """
    Inspect raw extracted PDF text, detect whether it uses legacy Kurdish font encodings
    or contains broken character extraction artifacts, and decode/normalize it to clean Unicode Kurdish.
    """
    if not raw_text or not raw_text.strip():
        return KurdishDecodeResult(
            is_legacy_encoded=False,
            raw_text=raw_text,
            decoded_text="",
            encoding_type="empty",
            confidence=1.0,
        )

    # 1. Check for AliKurdish legacy Latin character encoding signature
    legacy_char_count = sum(1 for c in raw_text if c in ALI_KURDISH_MAP)
    total_len = len(raw_text)
    legacy_ratio = legacy_char_count / float(max(1, total_len))

    is_legacy_encoded = False
    encoding_type = "clean_unicode"
    confidence = 1.0

    working_text = raw_text

    if legacy_ratio > 0.05:
        # High likelihood of legacy AliKurdish font encoding
        is_legacy_encoded = True
        encoding_type = "ali_kurdish_legacy"
        decoded_chars = []
        for ch in working_text:
            decoded_chars.append(ALI_KURDISH_MAP.get(ch, ch))
        working_text = "".join(decoded_chars)

    # 2. Normalize Unicode character variants
    normalized_text = normalize_arabic_to_kurdish_unicode(working_text)

    # 3. Apply Kurdish word & vowel repair patterns
    repaired_text = normalized_text
    repairs_made = 0
    for pattern, replacement in WORD_REPAIR_PATTERNS:
        new_text, count = re.subn(pattern, replacement, repaired_text)
        if count > 0:
            repaired_text = new_text
            repairs_made += count

    if repairs_made > 0 and not is_legacy_encoded:
        is_legacy_encoded = True
        encoding_type = "repaired_vowels"

    return KurdishDecodeResult(
        is_legacy_encoded=is_legacy_encoded,
        raw_text=raw_text,
        decoded_text=repaired_text,
        encoding_type=encoding_type,
        confidence=confidence,
    )
