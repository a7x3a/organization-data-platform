"""
Kurdish Content Categorization Module.

Categorizes Kurdish text into 7 thematic categories using keyword matching:
history, law, literature, religion, science, education, politics.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import structlog

log = structlog.get_logger(__name__)


@dataclass
class CategoryResult:
    category: str
    sub_category: str
    confidence: float
    tags: List[str]
    category_scores: Dict[str, float]
    keywords_found: Dict[str, List[str]]

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "sub_category": self.sub_category,
            "confidence": round(self.confidence, 3),
            "tags": self.tags,
            "category_scores": {k: round(v, 3) for k, v in self.category_scores.items()},
        }


# Kurdish keyword dictionaries by category
CATEGORY_KEYWORDS: Dict[str, Dict[str, List[str]]] = {
    "history": {
        "primary": [
            "مێژوو", "تاریخ", "جنگ", "کشتی", "بەکوکدان",
            "شەون", "دوخ", "گەلەک", "سەدە", "سال", "ڕووداو",
            "پەشین", "دواتر", "بەرامبەر", "لەمەوپێش",
        ],
        "secondary": [
            "تاریخی", "باسێن", "نووان", "بنەما", "پەیوەندی",
            "گوتیار", "کون", "نووی",
        ],
    },
    "law": {
        "primary": [
            "یاسا", "قانون", "دادگا", "ڕەخستن", "مۆڵەت",
            "بەرپرسیاری", "هەق", "بەرنامە", "سزا", "دەستوور",
            "پارلمان", "حکومەت", "رەک",
        ],
        "secondary": [
            "ماف", "ئوبووری", "دیاری", "هلبژاردن", "داتا",
            "ئەنجام",
        ],
    },
    "literature": {
        "primary": [
            "ئەدبیات", "چیرۆک", "شاعیر", "ئامانج", "رومان",
            "دیوان", "قیسە", "نووسین", "شاعر", "جور", "واژە",
            "ڕستە", "گیان", "هست", "رول", "ژیان",
        ],
        "secondary": [
            "وەژگەرێن", "خوەندن", "گوڤتار", "بانگ", "ئارامی",
        ],
    },
    "religion": {
        "primary": [
            "ئین", "مزگەوت", "قرئان", "نوژ", "ڕژوو",
            "پەغەمەر", "ئیسلام", "مەزەب", "برکەت", "تەوبە",
            "دعا", "دوس",
        ],
        "secondary": [
            "پیرۆز", "سڵاو", "قونەه", "خوا", "ئیمان",
            "کتەب", "حەدیس",
        ],
    },
    "science": {
        "primary": [
            "زانست", "تەکنەلۆژیا", "تاقیکردنەوە", "کیمیا", "فیزیا",
            "بایۆلۆژیا", "کۆمپیوتەر", "داتا", "سیستەم", "پرۆگرام",
            "ئەلم", "تاجڕۆب",
        ],
        "secondary": [
            "بیرکاری", "ئیستاتیستیک", "پەیپەر", "ریسەرچ", "مۆلت",
        ],
    },
    "education": {
        "primary": [
            "مەوەرخستن", "قوتابخانە", "خوەندن", "خوەندە", "ماموستا",
            "قۆتاب", "ئیمتحان", "نمرە", "پنل", "قنوغ",
        ],
        "secondary": [
            "نوە", "کون", "بالا", "ژمان", "زمان", "رەیدی", "ئینگلیزی",
        ],
    },
    "politics": {
        "primary": [
            "سیاسەت", "حزب", "حکومەت", "ناوەڕۆک", "بەرنامە",
            "هلبژاردن", "پارلمان", "وەزارەت", "سەرۆک", "دیموکراسی",
            "ئازادی", "جیهانی", "تەجەرە",
        ],
        "secondary": [
            "گڤتوگ", "کار", "باسڕگانی", "کۆمەلایەتی", "داتا",
        ],
    },
}


def _extract_tags(text: str) -> List[str]:
    """Extract year tags and numeric references from text."""
    tags = []
    for match in re.finditer(r"\b(1[3-9]\d{2}|20[0-2]\d)\b", text):
        year = match.group(1)
        if year not in tags:
            tags.append(year)
    return tags[:20]


def _count_keyword_matches(text: str, keywords: List[str]) -> int:
    """Count total keyword occurrences in text."""
    count = 0
    for kw in keywords:
        count += len(re.findall(re.escape(kw), text))
    return count


def categorize_content(
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    min_confidence: float = 0.3,
) -> CategoryResult:
    """
    Categorize Kurdish text content into thematic categories.

    Uses keyword matching against 7 category dictionaries to determine
    the most likely category and confidence level.

    Args:
        text: Input text to categorize
        metadata: Optional metadata dict (title, author, etc.)
        min_confidence: Minimum confidence threshold (default 0.3)

    Returns:
        CategoryResult with category, confidence, tags, and scores
    """
    if not text or not text.strip():
        return CategoryResult(
            category="unknown",
            sub_category="",
            confidence=0.0,
            tags=[],
            category_scores={},
            keywords_found={},
        )

    text_clean = text.strip()
    text_len = len(text_clean)

    category_scores: Dict[str, float] = {}
    keywords_found: Dict[str, List[str]] = {}

    for cat_name, cat_keywords in CATEGORY_KEYWORDS.items():
        primary_matches = _count_keyword_matches(text_clean, cat_keywords["primary"])
        secondary_matches = _count_keyword_matches(text_clean, cat_keywords["secondary"])

        # Normalize by text length (per 1000 chars)
        raw_score = (primary_matches * 2.0 + secondary_matches * 1.0) / max(1, text_len / 1000)
        normalized = min(1.0, raw_score)
        category_scores[cat_name] = normalized

        # Collect found keywords
        found = []
        for kw in cat_keywords["primary"] + cat_keywords["secondary"]:
            if kw in text_clean:
                found.append(kw)
        keywords_found[cat_name] = found[:10]

    # Determine best category
    best_category = max(category_scores, key=lambda k: category_scores[k]) if category_scores else "unknown"
    best_score = category_scores.get(best_category, 0.0)

    if best_score < min_confidence:
        best_category = "general"
        confidence = best_score
    else:
        confidence = best_score

    tags = _extract_tags(text_clean)

    log.info(
        "content_categorized",
        category=best_category,
        confidence=round(confidence, 3),
        text_len=text_len,
        tags_count=len(tags),
    )

    return CategoryResult(
        category=best_category,
        sub_category="",
        confidence=confidence,
        tags=tags,
        category_scores=category_scores,
        keywords_found=keywords_found,
    )
