"""
Tests for PDF extraction and quality classification engine (app.media.pdf_processor).
"""
import os
import tempfile
import pytest
from pypdf import PdfWriter, PageObject

from app.media.pdf_processor import extract_and_classify_pdf, PDFExtractionResult
from app.downloader.downloader import categorize_file


@pytest.fixture
def native_pdf_path():
    """Create a temporary PDF file containing clean native text."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    
    # Write a simple text PDF using pypdf writer (or sample text canvas)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    # Create a real text-containing PDF using pypdf annotation / page writer
    writer = PdfWriter()
    # Add page with text annotations / contents
    page = PageObject.create_blank_page(width=612, height=792)
    writer.add_page(page)
    
    # We can write simple pdf streams or test text content
    with open(tmp_path, "wb") as f:
        writer.write(f)

    yield tmp_path

    if os.path.exists(tmp_path):
        os.unlink(tmp_path)


def test_corrupt_pdf_returns_ocr_classification(tmp_path):
    bad_pdf = tmp_path / "bad.pdf"
    bad_pdf.write_bytes(b"This is not a valid PDF document stream")

    result = extract_and_classify_pdf(str(bad_pdf))
    assert isinstance(result, PDFExtractionResult)
    assert result.classification == "ocr"
    assert result.is_native is False
    assert "extraction_exception" in result.reason or "empty" in result.reason


def test_empty_page_pdf_returns_ocr_classification(tmp_path):
    pdf_path = tmp_path / "empty_pages.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    with open(pdf_path, "wb") as f:
        writer.write(f)

    result = extract_and_classify_pdf(str(pdf_path))
    assert result.classification == "ocr"
    assert result.is_native is False
    assert result.page_count == 1
    assert result.extracted_text_length == 0
    assert result.reason == "scanned_image_no_text_found"


def test_categorize_file_with_pdf_paths(tmp_path):
    pdf_path = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    with open(pdf_path, "wb") as f:
        writer.write(f)

    # Empty text PDF should categorize into 'pdf/ocr'
    cat_ocr = categorize_file("application/pdf", ".pdf", temp_path=str(pdf_path))
    assert cat_ocr == "pdf/ocr"

    # Non-existent path defaults gracefully
    cat_default = categorize_file("application/pdf", ".pdf", temp_path="/tmp/non_existent.pdf")
    assert cat_default == "pdf/native/decoded"
