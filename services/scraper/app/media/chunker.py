"""
Audio Chunker Module.

Splits long video/audio files into fixed-duration chunks (e.g. 30-60 seconds)
suited for Google Gemini LLM speech processing and dataset building.
"""
import os
import shutil
import subprocess
import wave
from dataclasses import dataclass
from typing import List, Optional

import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)


@dataclass
class AudioChunk:
    chunk_index: int
    file_path: str
    start_seconds: float
    end_seconds: float
    duration_seconds: float


class AudioChunkerError(Exception):
    """Exception raised when audio chunking fails."""
    pass


class AudioChunker:
    def __init__(self, chunk_seconds: Optional[int] = None, output_dir: Optional[str] = None):
        self.chunk_seconds = chunk_seconds or settings.audio_chunk_seconds
        self.output_dir = output_dir or os.path.join(settings.temp_dir, "chunks")
        os.makedirs(self.output_dir, exist_ok=True)

    def split_media(self, media_path: str) -> List[AudioChunk]:
        """
        Split a media file into audio chunks of duration `chunk_seconds`.
        """
        if not os.path.exists(media_path):
            raise AudioChunkerError(f"Input file for chunking does not exist: {media_path}")

        ffmpeg_bin = shutil.which("ffmpeg")
        if ffmpeg_bin:
            return self._split_with_ffmpeg(media_path, ffmpeg_bin)
        else:
            return self._split_fallback(media_path)

    def _get_media_duration_ffmpeg(self, media_path: str, ffprobe_bin: Optional[str]) -> Optional[float]:
        if not ffprobe_bin:
            return None
        try:
            cmd = [
                ffprobe_bin,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                media_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            return float(res.stdout.strip())
        except Exception:
            return None

    def _split_with_ffmpeg(self, media_path: str, ffmpeg_bin: str) -> List[AudioChunk]:
        ffprobe_bin = shutil.which("ffprobe")
        total_duration = self._get_media_duration_ffmpeg(media_path, ffprobe_bin)

        base_name = os.path.splitext(os.path.basename(media_path))[0]
        pattern = os.path.join(self.output_dir, f"{base_name}_chunk_%03d.mp3")

        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", media_path,
            "-f", "segment",
            "-segment_time", str(self.chunk_seconds),
            "-c:a", "libmp3lame",
            "-ar", "16000",
            "-ac", "1",
            "-b:a", "128k",
            pattern
        ]

        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except subprocess.CalledProcessError as e:
            log.error("ffmpeg_segment_failed", error=e.stderr.decode() if e.stderr else str(e))
            raise AudioChunkerError(f"FFmpeg chunking failed: {e}") from e

        # Gather created chunk files
        chunk_files = sorted([
            os.path.join(self.output_dir, f)
            for f in os.listdir(self.output_dir)
            if f.startswith(f"{base_name}_chunk_") and f.endswith(".mp3")
        ])

        chunks: List[AudioChunk] = []
        start = 0.0
        for idx, path in enumerate(chunk_files):
            end = start + float(self.chunk_seconds)
            if total_duration and end > total_duration:
                end = total_duration
            duration = end - start
            chunks.append(AudioChunk(
                chunk_index=idx,
                file_path=path,
                start_seconds=round(start, 2),
                end_seconds=round(end, 2),
                duration_seconds=round(duration, 2),
            ))
            start = end

        return chunks

    def _split_fallback(self, media_path: str) -> List[AudioChunk]:
        """
        Fallback Python chunking method when ffmpeg is not installed.
        For WAV files: splits using python `wave` module.
        For other formats: creates a single chunk copy of the input file.
        """
        ext = os.path.splitext(media_path)[1].lower()
        base_name = os.path.splitext(os.path.basename(media_path))[0]

        if ext == ".wav":
            try:
                return self._split_wav_native(media_path)
            except Exception as exc:
                log.warning("native_wav_split_failed_fallback_to_single", error=str(exc))

        # Single chunk fallback
        dest_chunk = os.path.join(self.output_dir, f"{base_name}_chunk_000{ext}")
        shutil.copy2(media_path, dest_chunk)
        return [
            AudioChunk(
                chunk_index=0,
                file_path=dest_chunk,
                start_seconds=0.0,
                end_seconds=0.0,
                duration_seconds=0.0,
            )
        ]

    def _split_wav_native(self, wav_path: str) -> List[AudioChunk]:
        chunks: List[AudioChunk] = []
        base_name = os.path.splitext(os.path.basename(wav_path))[0]

        with wave.open(wav_path, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            total_duration = n_frames / float(framerate)

            frames_per_chunk = int(self.chunk_seconds * framerate)
            idx = 0
            start_sec = 0.0

            while wf.tell() < n_frames:
                data = wf.readframes(frames_per_chunk)
                if not data:
                    break

                out_path = os.path.join(self.output_dir, f"{base_name}_chunk_{idx:03d}.wav")
                with wave.open(out_path, "wb") as out_wf:
                    out_wf.setnchannels(n_channels)
                    out_wf.setsampwidth(sampwidth)
                    out_wf.setframerate(framerate)
                    out_wf.writeframes(data)

                chunk_dur = len(data) / (n_channels * sampwidth * framerate)
                end_sec = start_sec + chunk_dur

                chunks.append(AudioChunk(
                    chunk_index=idx,
                    file_path=out_path,
                    start_seconds=round(start_sec, 2),
                    end_seconds=round(end_sec, 2),
                    duration_seconds=round(chunk_dur, 2),
                ))

                idx += 1
                start_sec = end_sec

        return chunks
