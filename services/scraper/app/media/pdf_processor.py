"""
PDF document extraction, Kurdish font decoding & quality classification engine.

Inspects downloaded PDF documents, extracts text, applies Kurdish font decoding / Unicode normalization
for custom-encoded native PDFs, measures text density & printable character quality, and determines
whether the document is 'pdf/native/decoded', 'pdf/native/encoded', or 'pdf/ocr'.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
import re
import structlog

from app.media.kurdish_decoder import detect_and_decode_kurdish

log = structlog.get_logger(__name__)


@dataclass
class PDFExtractionResult:
    classification: str  # "digital" or "ocr"
    is_native: bool
    is_legacy_encoded: bool
    page_count: int
    extracted_text_length: int
    text_density: float  # Avg printable characters per page
    printable_ratio: float  # Fraction of total chars that are clean printable text
    quality_score: float  # 0.0 to 1.0 overall extraction quality
    has_images: bool
    reason: str
    text_sample: str = ""  # First 500 characters of clean decoded text preview
    raw_text_sample: str = ""  # First 500 characters of raw extracted text preview
    encoding_type: str = "clean_unicode"

    @property
    def folder_path(self) -> str:
        """Return the target storage subfolder: pdf/digital or pdf/ocr."""
        if not self.is_native or self.classification == "ocr":
            return "pdf/ocr"
        return "pdf/digital"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "classification": self.classification,
            "folder_path": self.folder_path,
            "is_native": self.is_native,
            "is_legacy_encoded": self.is_legacy_encoded,
            "page_count": self.page_count,
            "extracted_text_length": self.extracted_text_length,
            "text_density": round(self.text_density, 2),
            "printable_ratio": round(self.printable_ratio, 4),
            "quality_score": round(self.quality_score, 4),
            "has_images": self.has_images,
            "reason": self.reason,
            "text_sample": self.text_sample,
            "raw_text_sample": self.raw_text_sample,
            "encoding_type": self.encoding_type,
        }


def extract_and_classify_pdf(
    file_path: str,
    *,
    min_chars_per_page: float = 40.0,
    min_printable_ratio: float = 0.80,
    max_sample_len: int = 500,
) -> PDFExtractionResult:
    """
    Inspect a PDF file on disk, extract text, run Kurdish font decoding & Unicode normalization,
    and classify into pdf/native/decoded, pdf/native/encoded, or pdf/ocr.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        page_count = len(reader.pages)
        if page_count == 0:
            return PDFExtractionResult(
                classification="ocr",
                is_native=False,
                is_legacy_encoded=False,
                page_count=0,
                extracted_text_length=0,
                text_density=0.0,
                printable_ratio=0.0,
                quality_score=0.0,
                has_images=False,
                reason="empty_pdf_no_pages",
            )

        full_extracted_text = []
        total_chars = 0
        printable_chars = 0
        has_images = False

        for page_idx, page in enumerate(reader.pages):
            # Check for images on page
            try:
                if len(page.images) > 0:
                    has_images = True
            except Exception:
                pass

            # Extract text from page
            try:
                page_text = page.extract_text() or ""
            except Exception as e:
                log.debug("pdf_page_extract_error", page=page_idx, error=str(e))
                page_text = ""

            if page_text:
                full_extracted_text.append(page_text)
                total_chars += len(page_text)
                printable_count = len(re.findall(r"[^\x00-\x08\x0b\x0c\x0e-\x1f]", page_text))
                printable_chars += printable_count

        combined_raw_text = "\n".join(full_extracted_text).strip()
        extracted_text_length = len(combined_raw_text)
        text_density = total_chars / float(page_count)
        printable_ratio = (printable_chars / float(total_chars)) if total_chars > 0 else 0.0

        # Run Kurdish font decoding and Unicode normalization
        kurdish_res = detect_and_decode_kurdish(combined_raw_text)
        decoded_text = kurdish_res.decoded_text

        # Density score (normalizing 150 chars/page as full score 1.0)
        density_score = min(1.0, text_density / 150.0)
        quality_score = density_score * printable_ratio

        raw_sample = combined_raw_text[:max_sample_len].strip()
        decoded_sample = decoded_text[:max_sample_len].strip()

        # Decision rules for Digital vs OCR
        if total_chars == 0:
            classification = "ocr"
            is_native = False
            is_legacy_encoded = False
            reason = "scanned_image_no_text_found"
        elif text_density < min_chars_per_page:
            classification = "ocr"
            is_native = False
            is_legacy_encoded = False
            reason = f"low_text_density_{text_density:.1f}_chars_per_page"
        elif printable_ratio < min_printable_ratio:
            classification = "ocr"
            is_native = False
            is_legacy_encoded = False
            reason = f"unprintable_garbage_encoding_ratio_{printable_ratio:.2f}"
        elif kurdish_res.is_legacy_encoded:
            classification = "digital"
            is_native = True
            is_legacy_encoded = True
            reason = f"kurdish_legacy_font_decoded_{kurdish_res.encoding_type}"
        else:
            classification = "digital"
            is_native = True
            is_legacy_encoded = False
            reason = "clean_native_text_extracted"

        log.info(
            "pdf_classification_complete",
            classification=classification,
            is_legacy_encoded=is_legacy_encoded,
            pages=page_count,
            text_len=extracted_text_length,
            density=round(text_density, 2),
            quality=round(quality_score, 3),
            reason=reason,
        )

        return PDFExtractionResult(
            classification=classification,
            is_native=is_native,
            is_legacy_encoded=is_legacy_encoded,
            page_count=page_count,
            extracted_text_length=extracted_text_length,
            text_density=text_density,
            printable_ratio=printable_ratio,
            quality_score=quality_score,
            has_images=has_images,
            reason=reason,
            text_sample=decoded_sample,
            raw_text_sample=raw_sample,
            encoding_type=kurdish_res.encoding_type,
        )

    except Exception as e:
        log.warning("pdf_extraction_failed", error=str(e))
        return PDFExtractionResult(
            classification="ocr",
            is_native=False,
            is_legacy_encoded=False,
            page_count=0,
            extracted_text_length=0,
            text_density=0.0,
            printable_ratio=0.0,
            quality_score=0.0,
            has_images=False,
            reason=f"extraction_exception_{type(e).__name__}",
        )
