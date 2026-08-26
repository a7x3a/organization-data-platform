"""
Tests for app.telegram.api_server helper functions.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.config.settings import settings
from app.telegram.api_server import send_verification_code, verify_code_and_login


@pytest.mark.asyncio
async def test_verify_code_and_login_handles_none_session():
    mock_client = MagicMock()
    mock_client.connect = AsyncMock()
    mock_client.sign_in = AsyncMock()
    mock_client.get_me = AsyncMock(return_value=MagicMock(id=123, first_name="Test", username="testuser", phone="+12345"))
    mock_client.disconnect = AsyncMock()
    mock_client.session = None  # Simulating None session

    with patch("app.telegram.api_server.TelegramClient", return_value=mock_client):
        res = await verify_code_and_login(
            phone_number="+1234567890",
            phone_code_hash="hash123",
            code="12345",
            api_id="12345",
            api_hash="hash",
        )
        assert res["success"] is False
        assert "Failed to generate Telegram session string" in res["error"]


@pytest.mark.asyncio
async def test_verify_code_and_login_successful_session():
    mock_client = MagicMock()
    mock_client.connect = AsyncMock()
    mock_client.sign_in = AsyncMock()
    mock_client.get_me = AsyncMock(return_value=MagicMock(id=123, first_name="Test", username="testuser", phone="+12345"))
    mock_client.disconnect = AsyncMock()
    mock_session = MagicMock()
    mock_session.save.return_value = "1BQAC..."
    mock_client.session = mock_session

    with patch("app.telegram.api_server.TelegramClient", return_value=mock_client) as mock_tg_cls:
        res = await verify_code_and_login(
            phone_number="+1234567890",
            phone_code_hash="hash123",
            code="12345",
            api_id="12345",
            api_hash="hash",
        )
        assert res["success"] is True
        assert res["session_string"] == "1BQAC..."
        assert res["user"]["id"] == 123
        assert mock_tg_cls.call_args[0][1] == 12345


@pytest.mark.asyncio
async def test_send_verification_code_converts_api_id_to_int():
    mock_client = MagicMock()
    mock_client.connect = AsyncMock()
    mock_client.send_code_request = AsyncMock(return_value=MagicMock(phone_code_hash="hash123"))
    mock_client.disconnect = AsyncMock()

    with patch("app.telegram.api_server.TelegramClient", return_value=mock_client) as mock_tg_cls:
        res = await send_verification_code(
            phone_number="+1234567890",
            api_id="99999",
            api_hash="hash",
        )
        assert res["success"] is True
        assert res["phone_code_hash"] == "hash123"
        assert mock_tg_cls.call_args[0][1] == 99999

