from app.normalize.structured_document import build_structured_document


def test_build_structured_document_matches_canonical_shape():
    document = build_structured_document(
        document_id="sha256-id",
        source_name="Kurdistani Nwe",
        source_url="https://archive.example.com/2017/report.docx",
        file_path="00_raw/web/source/run/documents/report.docx",
        title="ڕاپۆرتی تاقیکردنەوە",
        raw_text="یەکەم پەرەگراف\n\nدووەم پەرەگراف",
        language={
            "language": "ckb",
            "confidence": 0.95,
            "script": "arabic",
            "is_rtl": True,
        },
    )

    assert document["schema_version"] == "structured_document.v1"
    assert document["source"]["domain"] == "example.com"
    assert document["source"]["subdomain"] == "archive"
    assert document["document"]["dialect"] == "sorani"
    assert document["document"]["direction"] == "rtl"
    assert document["text"]["primary_text"] == document["text"]["normalized_text"]
    assert document["text"]["primary_text_source"] == "normalized_text"
    assert document["text"]["paragraphs"] == ["یەکەم پەرەگراف", "دووەم پەرەگراف"]
    assert document["structure"]["paragraph_count"] == 2
    assert document["structure"]["word_count"] == 4


def test_build_structured_document_does_not_claim_unknown_language_verified():
    document = build_structured_document(
        document_id="id",
        source_name="source",
        source_url="https://example.com/page",
        file_path="page.txt",
        title="Page",
        raw_text="Some text with an unknown language result.",
    )

    assert document["document"]["language"] == "unknown"
    assert document["quality"]["language_verified"] is False
    assert document["document"]["direction"] == "ltr"