"""
Quality Scoring Module for collected files.

Scores files 0-100 based on:
- Text density (chars per page for PDFs, word count for text)
- Encoding quality (mojibake detection, printable ratio)
- Metadata completeness (title, author, subject present)
- File integrity (size vs expected, no corruption)
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import structlog

log = structlog.get_logger(__name__)

# Characters that indicate mojibake / encoding issues
_MOJIBAKE_PATTERNS = [
    re.compile(r"Ã[\x80-\xbf]"),           # UTF-8 misread as Latin-1
    re.compile(r"â€[™""']"),               # Smart quotes mojibake
    re.compile(r"Â[\x80-\xbf]"),           # Another UTF-8 misread
    re.compile(r"\xc3[\x80-\xbf]{2}"),     # Double UTF-8
    re.compile(r"[\ufffd]{2,}"),            # Multiple replacement chars
]

# Common Kurdish legacy font characters (indicates encoding issues)
_LEGACY_FONT_CHARS = frozenset("\xe0\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xeb\xec\xed\xee\xef\xf0\xf1\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xfb\xfc\xfd\xfe\xff")


@dataclass
class QualityResult:
    score: int                    # 0-100 composite score
    breakdown: Dict[str, float]   # Individual factor scores (0.0-1.0)
    text_density: float           # Chars per page or per KB
    printable_ratio: float        # Fraction of printable characters
    encoding_quality: float       # 0.0 = garbled, 1.0 = clean
    metadata_completeness: float  # 0.0 = no metadata, 1.0 = full
    file_integrity: float         # 0.0 = corrupt, 1.0 = healthy

    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "breakdown": {k: round(v, 3) for k, v in self.breakdown.items()},
            "text_density": round(self.text_density, 3),
            "printable_ratio": round(self.printable_ratio, 3),
            "encoding_quality": round(self.encoding_quality, 3),
            "metadata_completeness": round(self.metadata_completeness, 3),
            "file_integrity": round(self.file_integrity, 3),
        }


def _detect_mojibake(text: str) -> float:
    """
    Detect mojibake (encoding corruption) in text.
    Returns 0.0 (clean) to 1.0 (heavily corrupted).
    """
    if not text:
        return 0.0

    total_chars = len(text)
    if total_chars == 0:
        return 0.0

    mojibake_count = 0
    for pattern in _MOJIBAKE_PATTERNS:
        mojibake_count += len(pattern.findall(text))

    # Check for legacy font characters
    legacy_count = sum(1 for ch in text if ch in _LEGACY_FONT_CHARS)

    # Check for replacement characters
    replacement_count = text.count("\ufffd")

    # Check for control characters (except common whitespace)
    control_count = sum(1 for ch in text if ord(ch) < 32 and ch not in "\n\r\t")

    bad_chars = mojibake_count + legacy_count + replacement_count + control_count
    return min(1.0, bad_chars / max(1, total_chars))


def _compute_printable_ratio(text: str) -> float:
    """Compute fraction of printable characters."""
    if not text:
        return 0.0

    total = len(text)
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\n\r\t")
    return printable / total


def _compute_text_density(text: str, page_count: Optional[int] = None, file_size: Optional[int] = None) -> float:
    """
    Compute text density metric.
    For PDFs: chars per page.
    For text files: chars per KB.
    """
    text_len = len(text)

    if page_count and page_count > 0:
        return text_len / page_count

    if file_size and file_size > 0:
        return text_len / (file_size / 1024.0)

    return text_len


def _score_text_density(density: float, file_type: str) -> float:
    """
    Score text density on 0-1 scale.
    Different thresholds for different file types.
    """
    if file_type == "pdf":
        # PDFs: 150+ chars/page is excellent
        if density >= 150:
            return 1.0
        elif density >= 100:
            return 0.85
        elif density >= 50:
            return 0.6
        elif density >= 20:
            return 0.3
        else:
            return 0.1
    else:
        # Text files: 500+ chars/KB is excellent
        if density >= 500:
            return 1.0
        elif density >= 300:
            return 0.85
        elif density >= 100:
            return 0.6
        elif density >= 30:
            return 0.3
        else:
            return 0.1


def _score_metadata_completeness(metadata: Optional[Dict[str, Any]]) -> float:
    """
    Score metadata completeness based on presence of key fields.
    """
    if not metadata:
        return 0.0

    important_fields = ["title", "author", "subject", "language", "date", "topic"]
    present = sum(1 for field in important_fields if metadata.get(field))
    return present / len(important_fields)


def _score_file_integrity(file_path: str, file_size: int, mime_type: Optional[str] = None) -> float:
    """
    Score file integrity based on size and basic checks.
    """
    score = 1.0

    # Empty file is bad
    if file_size == 0:
        return 0.0

    # Very small files might be corrupt
    if file_size < 100:
        score *= 0.5

    # Check if file exists and is readable
    if not os.path.exists(file_path):
        return 0.0

    # For PDFs, check basic structure
    if mime_type == "application/pdf" or file_path.lower().endswith(".pdf"):
        try:
            with open(file_path, "rb") as f:
                header = f.read(5)
                if header != b"%PDF-":
                    score *= 0.3
        except Exception:
            score *= 0.5

    return score


def score_quality(
    file_path: str,
    text_content: str = "",
    mime_type: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    page_count: Optional[int] = None,
) -> QualityResult:
    """
    Compute a comprehensive quality score for a collected file.

    Returns a QualityResult with a composite score (0-100) and individual factors.
    """
    file_size = 0
    try:
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    except OSError:
        pass

    # Determine file type category
    file_type = "pdf" if (mime_type == "application/pdf" or (file_path and file_path.lower().endswith(".pdf"))) else "text"

    # 1. Text density scoring
    density = _compute_text_density(text_content, page_count, file_size)
    density_score = _score_text_density(density, file_type)

    # 2. Printable ratio
    printable_ratio = _compute_printable_ratio(text_content)

    # 3. Encoding quality (inverse of mojibake)
    mojibake_ratio = _detect_mojibake(text_content)
    encoding_quality = 1.0 - mojibake_ratio

    # 4. Metadata completeness
    metadata_score = _score_metadata_completeness(metadata)

    # 5. File integrity
    integrity_score = _score_file_integrity(file_path, file_size, mime_type)

    # Weighted composite score
    weights = {
        "text_density": 0.25,
        "printable_ratio": 0.15,
        "encoding_quality": 0.30,
        "metadata_completeness": 0.15,
        "file_integrity": 0.15,
    }

    breakdown = {
        "text_density": density_score,
        "printable_ratio": printable_ratio,
        "encoding_quality": encoding_quality,
        "metadata_completeness": metadata_score,
        "file_integrity": integrity_score,
    }

    composite = sum(breakdown[k] * weights[k] for k in weights)
    final_score = max(0, min(100, round(composite * 100)))

    log.info(
        "quality_score_computed",
        score=final_score,
        file_type=file_type,
        text_len=len(text_content),
        density=round(density, 1),
    )

    return QualityResult(
        score=final_score,
        breakdown=breakdown,
        text_density=density,
        printable_ratio=printable_ratio,
        encoding_quality=encoding_quality,
        metadata_completeness=metadata_score,
        file_integrity=integrity_score,
    )
