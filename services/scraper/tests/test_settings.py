"""
Settings validation — in particular the TELEGRAM_API_ID empty-string case,
which only surfaced by actually running the container: docker-compose's
`${TELEGRAM_API_ID:-}` passes an empty string (not an unset variable) when
a deployment doesn't use the Telegram collector, and pydantic rejects ""
as "not a valid integer" unless explicitly told to treat it as unset.
"""
from app.config.settings import Settings


def test_blank_telegram_api_id_is_treated_as_unset(monkeypatch):
    monkeypatch.setenv("TELEGRAM_API_ID", "")
    settings = Settings(_env_file=None)
    assert settings.telegram_api_id is None


def test_real_telegram_api_id_is_parsed():
    settings = Settings(_env_file=None, telegram_api_id="12345")
    assert settings.telegram_api_id == 12345


def test_telegram_api_id_defaults_to_none_when_absent():
    settings = Settings(_env_file=None)
    assert settings.telegram_api_id is None
