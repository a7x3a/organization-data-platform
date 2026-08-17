from app.media.kurdish_decoder import (
    detect_and_decode_kurdish,
    normalize_arabic_to_kurdish_unicode,
)


def test_arabic_unicode_normalization():
    # Convert Arabic Kafka (ك) -> Kurdish Kafka (ک) and Arabic Yeh (ي) -> Kurdish Yeh (ی)
    raw = "بازاری كاری كەرتی تایبەت"
    normalized = normalize_arabic_to_kurdish_unicode(raw)
    assert "ک" in normalized
    assert "ك" not in normalized


def test_kurdish_vowel_and_word_repair():
    # User's exact extracted Kurdish string sample
    sample_garbled = "بازاڕی کاری کرتی تایبت ک تیدا کارمندان دۆزنوە"
    res = detect_and_decode_kurdish(sample_garbled)

    assert res.is_legacy_encoded is True
    assert "کەرتی" in res.decoded_text
    assert "تایبەت" in res.decoded_text
    assert "تێدا" in res.decoded_text
    assert "دۆزنەوە" in res.decoded_text


def test_clean_kurdish_unicode_detection():
    clean_kurdish = "ئەمەش دەقێکی کوردیی ڕوون و دروستە بۆ تاقیکردنەوە."
    res = detect_and_decode_kurdish(clean_kurdish)

    assert res.is_legacy_encoded is False
    assert res.decoded_text == clean_kurdish
