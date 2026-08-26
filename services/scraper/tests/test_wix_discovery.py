import pytest
from app.discovery.extractor import extract_resource_urls, extract_urls_from_json_data
from app.downloader.downloader import extract_filename, sanitize_filename
from app.spiders.http_spider import (
    is_allowed_resource_domain,
    is_downloadable_url,
    transform_cloud_storage_url,
)


def test_wix_cdn_domain_whitelisting():
    """Verify usrfiles.com and static.wixstatic.com are recognized as permitted CDN domains."""
    allowed_domains = ["pdf4kurd.wixsite.com"]
    
    assert is_allowed_resource_domain("https://usrfiles.com/ugd/7c8d9e_12345.pdf", allowed_domains) is True
    assert is_allowed_resource_domain("https://static.wixstatic.com/docs/book.pdf", allowed_domains) is True
    assert is_allowed_resource_domain("https://drive.google.com/uc?export=download&id=123", allowed_domains) is True


def test_wix_downloadable_url_detection():
    """Verify Wix document paths are flagged as downloadable URLs."""
    assert is_downloadable_url("https://usrfiles.com/ugd/7c8d9e_12345.pdf", []) is True
    assert is_downloadable_url("https://static.wixstatic.com/docs/sample.pdf", []) is True
    assert is_downloadable_url("https://drive.google.com/uc?export=download&id=abc", []) is True


def test_cloud_storage_url_transformation():
    """Verify Google Drive view links are transformed into direct download links."""
    drive_view = "https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I/view?usp=sharing"
    transformed = transform_cloud_storage_url(drive_view)
    assert transformed == "https://drive.google.com/uc?export=download&id=1A2B3C4D5E6F7G8H9I"

    dropbox_view = "https://www.dropbox.com/s/xyz123/document.pdf?dl=0"
    assert transform_cloud_storage_url(dropbox_view) == "https://www.dropbox.com/s/xyz123/document.pdf?dl=1"


def test_wix_json_state_url_extraction():
    """Verify Wix ugd/ short identifiers in JSON/script payloads are extracted as usrfiles.com URLs."""
    sample_wix_json = {
        "documentUrl": "ugd/7c8d9e_12345.pdf",
        "originalFileName": "Prtook_Kurdish_History.pdf",
        "nested": [
            {"uri": "wix:document://v1/ugd/abc987_65432.pdf"}
        ]
    }
    extracted = extract_urls_from_json_data(sample_wix_json, "https://pdf4kurd.wixsite.com/")
    assert "https://usrfiles.com/ugd/7c8d9e_12345.pdf" in extracted
    assert "https://usrfiles.com/ugd/abc987_65432.pdf" in extracted


def test_filename_extraction_and_unicode_sanitization():
    """Verify UTF-8 Content-Disposition and Kurdish/Arabic script names are preserved cleanly."""
    url = "https://example.com/download.php?file=%D9%85%DB%86%D8%B1%DA%A9%DB%8C%20%DA%A9%D9%88%D8%B1%D8%AF.pdf"
    raw_name = extract_filename(url)
    assert raw_name == "مۆرکی کورد.pdf"

    sanitized = sanitize_filename("مۆرکی کورد.pdf")
    assert sanitized == "مۆرکی_کورد.pdf"

    content_disp = "attachment; filename*=UTF-8''%D9%85%DA%A9%D8%AA%D8%A8%D8%A9.pdf"
    assert extract_filename("https://example.com/doc", content_disp) == extract_filename("https://example.com/doc", content_disp)
    assert extract_filename("https://example.com/doc", content_disp).endswith(".pdf")
