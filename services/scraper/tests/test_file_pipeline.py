"""
Tests for app.pipeline.file_pipeline.FilePipeline — in particular
report_file_error's url handling: job-level failures (bad Telegram
credentials, an uncaught exception before any file was ever discovered)
have no single file to attribute the error to, and must omit the `url` key
entirely rather than send `null`, since the API's Zod schema
(`url: z.string().optional()`) accepts a missing key but rejects a literal
null with a 400 — which would have silently discarded exactly the error
message a failed run most needs to show the user.
"""
import json

import httpx
import pytest
import respx

from app.pipeline.file_pipeline import FilePipeline


@pytest.fixture
def pipeline():
    client = httpx.AsyncClient(base_url="https://api.test")
    return FilePipeline(
        api_client=client,
        run_db_id="run-1",
        source_id="source-1",
        run_folder_key="00_raw/telegram/test/run-1",
    )


@respx.mock
async def test_report_file_error_omits_url_key_when_none(pipeline):
    route = respx.post("https://api.test/api/runs/run-1/errors").mock(
        return_value=httpx.Response(201)
    )

    await pipeline.report_file_error(None, "UNKNOWN", "Telegram credentials not configured")

    sent_body = json.loads(route.calls.last.request.content)
    assert "url" not in sent_body
    assert sent_body["errorCode"] == "UNKNOWN"
    assert sent_body["message"] == "Telegram credentials not configured"


@respx.mock
async def test_report_file_error_includes_url_when_given(pipeline):
    route = respx.post("https://api.test/api/runs/run-1/errors").mock(
        return_value=httpx.Response(201)
    )

    await pipeline.report_file_error("https://example.com/a.pdf", "NETWORK_ERROR", "timed out")

    sent_body = json.loads(route.calls.last.request.content)
    assert sent_body["url"] == "https://example.com/a.pdf"


@respx.mock
async def test_report_file_error_swallows_api_failures(pipeline):
    respx.post("https://api.test/api/runs/run-1/errors").mock(
        return_value=httpx.Response(500)
    )
    # Must not raise — a failing error-report call shouldn't crash the job
    # that's already in the middle of handling its own failure.
    await pipeline.report_file_error(None, "UNKNOWN", "something broke")
