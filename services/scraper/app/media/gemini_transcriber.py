"""
Google Gemini API Audio Transcriber Module.

Processes audio chunks using Google Gemini models (e.g. gemini-2.0-flash)
for speech-to-text transcription, speaker detection, and timestamp mapping.
"""
import base64
import os
from dataclasses import dataclass
from typing import Optional

import httpx
import structlog

from app.config.settings import settings
from app.media.chunker import AudioChunk

log = structlog.get_logger(__name__)


@dataclass
class ChunkTranscription:
    chunk_index: int
    transcript: str
    speaker: Optional[str]
    language: str
    confidence: float
    start_seconds: float
    end_seconds: float
    audio_file_path: str


class GeminiTranscriberError(Exception):
    """Exception raised when Gemini API transcription fails."""
    pass


class GeminiTranscriber:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
    ):
        self.api_key = api_key or settings.gemini_api_key
        self.model_name = model_name or settings.gemini_model
        self.api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"

    async def transcribe_chunk(self, chunk: AudioChunk) -> ChunkTranscription:
        """
        Transcribe an audio chunk using Google Gemini API.
        """
        if not self.api_key:
            log.info("gemini_api_key_not_set_using_offline_transcription", chunk_index=chunk.chunk_index)
            return self._offline_fallback_transcription(chunk)

        if not os.path.exists(chunk.file_path):
            raise GeminiTranscriberError(f"Audio chunk file missing: {chunk.file_path}")

        # Read audio & encode base64
        with open(chunk.file_path, "rb") as f:
            audio_bytes = f.read()

        b64_data = base64.b64encode(audio_bytes).decode("utf-8")
        ext = os.path.splitext(chunk.file_path)[1].lower()
        mime_type = "audio/wav" if ext == ".wav" else "audio/mp3"

        prompt = (
            "Provide a precise, verbatim speech-to-text transcription of this audio. "
            "Detect the spoken language, identify distinct speakers if possible (e.g. Speaker 1), "
            "and respond in clean text without markdown or conversational commentary."
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048,
            },
        }

        url_with_key = f"{self.api_url}?key={self.api_key}"

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(url_with_key, json=payload)
                response.raise_for_status()
                res_json = response.json()
                
                candidates = res_json.get("candidates", [])
                if not candidates:
                    raise GeminiTranscriberError("No transcription returned from Gemini API.")

                text_parts = candidates[0].get("content", {}).get("parts", [])
                transcript = "".join(part.get("text", "") for part in text_parts).strip()

                return ChunkTranscription(
                    chunk_index=chunk.chunk_index,
                    transcript=transcript,
                    speaker=None,
                    language="auto",
                    confidence=0.95,
                    start_seconds=chunk.start_seconds,
                    end_seconds=chunk.end_seconds,
                    audio_file_path=chunk.file_path,
                )
            except Exception as e:
                log.error("gemini_api_transcription_error", error=str(e), chunk_index=chunk.chunk_index)
                raise GeminiTranscriberError(f"Gemini API request failed: {e}") from e

    def _offline_fallback_transcription(self, chunk: AudioChunk) -> ChunkTranscription:
        """
        Offline fallback when GEMINI_API_KEY is not configured in local environment.
        """
        return ChunkTranscription(
            chunk_index=chunk.chunk_index,
            transcript=f"[Offline Mock Transcription for chunk {chunk.chunk_index} ({chunk.start_seconds}s - {chunk.end_seconds}s)]",
            speaker="Speaker_1",
            language="en",
            confidence=1.0,
            start_seconds=chunk.start_seconds,
            end_seconds=chunk.end_seconds,
            audio_file_path=chunk.file_path,
        )
