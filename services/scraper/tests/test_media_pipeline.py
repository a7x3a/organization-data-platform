"""
Tests for Media Downloader, Audio Chunker, Gemini Transcriber, Dataset Builder, and MediaCollectionJob.
"""
import json
import os
import tempfile
import wave
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.media.downloader import MediaDownloader, MediaDownloadResult
from app.media.chunker import AudioChunker, AudioChunk
from app.media.gemini_transcriber import GeminiTranscriber, ChunkTranscription
from app.media.dataset_builder import DatasetBuilder
from app.jobs.media_job import MediaCollectionJob


@pytest.fixture
def temp_dir():
    with tempfile.TemporaryDirectory() as tmp:
        yield tmp


@pytest.fixture
def sample_wav_file(temp_dir):
    wav_path = os.path.join(temp_dir, "sample.wav")
    # Generate 3 seconds of silence at 16000Hz mono
    framerate = 16000
    nchannels = 1
    sampwidth = 2
    nframes = framerate * 3  # 3 seconds

    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(nchannels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(framerate)
        wf.writeframes(b"\x00\x00" * nframes)

    return wav_path


def test_media_downloader_youtube_url_check():
    assert MediaDownloader.is_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is True
    assert MediaDownloader.is_youtube_url("https://youtu.be/dQw4w9WgXcQ") is True
    assert MediaDownloader.is_youtube_url("https://example.com/audio.mp3") is False


def test_media_downloader_local_file(sample_wav_file):
    downloader = MediaDownloader()
    result = downloader._handle_local_file(sample_wav_file)
    assert isinstance(result, MediaDownloadResult)
    assert result.local_path == sample_wav_file
    assert result.mime_type == "audio/wav"


def test_audio_chunker_native_wav_split(sample_wav_file, temp_dir):
    chunker = AudioChunker(chunk_seconds=1, output_dir=temp_dir)
    chunks = chunker._split_wav_native(sample_wav_file)

    assert len(chunks) == 3
    assert chunks[0].chunk_index == 0
    assert chunks[0].start_seconds == 0.0
    assert chunks[0].end_seconds == 1.0
    assert chunks[2].start_seconds == 2.0


@pytest.mark.asyncio
async def test_gemini_transcriber_offline_fallback(sample_wav_file):
    chunk = AudioChunk(
        chunk_index=0,
        file_path=sample_wav_file,
        start_seconds=0.0,
        end_seconds=1.0,
        duration_seconds=1.0,
    )
    transcriber = GeminiTranscriber(api_key=None)
    result = await transcriber.transcribe_chunk(chunk)

    assert isinstance(result, ChunkTranscription)
    assert "Mock Transcription" in result.transcript
    assert result.start_seconds == 0.0


def test_dataset_builder(temp_dir):
    media_info = MediaDownloadResult(
        local_path=os.path.join(temp_dir, "podcast.mp3"),
        title="Sample Podcast",
        duration_seconds=120.0,
        mime_type="audio/mp3",
        source_url="https://example.com/podcast.mp3",
    )
    transcriptions = [
        ChunkTranscription(
            chunk_index=0,
            transcript="Welcome to the podcast.",
            speaker="Host",
            language="en",
            confidence=0.98,
            start_seconds=0.0,
            end_seconds=5.0,
            audio_file_path=os.path.join(temp_dir, "chunk_000.mp3"),
        ),
        ChunkTranscription(
            chunk_index=1,
            transcript="Today we discuss data platforms.",
            speaker="Guest",
            language="en",
            confidence=0.95,
            start_seconds=5.0,
            end_seconds=10.0,
            audio_file_path=os.path.join(temp_dir, "chunk_001.mp3"),
        ),
    ]

    builder = DatasetBuilder(output_dir=temp_dir)
    result_paths = builder.build_dataset(media_info, transcriptions)

    assert os.path.exists(result_paths["stt_dataset"])
    assert os.path.exists(result_paths["tts_dataset"])
    assert os.path.exists(result_paths["full_transcript"])

    with open(result_paths["stt_dataset"], "r", encoding="utf-8") as f:
        stt_lines = [json.loads(line) for line in f]
        assert len(stt_lines) == 2
        assert stt_lines[0]["transcript"] == "Welcome to the podcast."
        assert stt_lines[1]["speaker"] == "Guest"


@pytest.mark.asyncio
async def test_media_collection_job_execution(sample_wav_file, temp_dir):
    job_data = {
        "runId": "run-test-media-123",
        "sourceId": "source-456",
        "sourceSlug": "test-podcast",
        "runFolderKey": "00_raw/media/test-podcast/run-test-media-123",
        "collectorType": "MEDIA",
        "configuration": {
            "localPath": sample_wav_file,
            "audioChunkSeconds": 1,
        },
    }

    mock_api = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"fileId": "mock-file-id-123", "status": "RUNNING"}
    mock_resp.raise_for_status = MagicMock()
    mock_api.get = AsyncMock(return_value=mock_resp)
    mock_api.post = AsyncMock(return_value=mock_resp)
    mock_api.patch = AsyncMock(return_value=mock_resp)

    job = MediaCollectionJob(job_data, mock_api)
    await job.run()

    # Check API status call was made
    assert mock_api.patch.called
    assert mock_api.post.called
