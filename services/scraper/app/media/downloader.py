"""
Media Downloader Module.

Supports:
1. YouTube / online video URLs (via yt-dlp).
2. Direct HTTP video & audio download (MP3, WAV, MP4, M4A, OGG, FLAC, WEBM, MKV).
3. Local video / audio file paths.
"""
import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
import structlog

from app.config.settings import settings

log = structlog.get_logger(__name__)

AUDIO_VIDEO_EXTENSIONS = {
    ".mp3", ".wav", ".mp4", ".m4a", ".ogg", ".flac",
    ".aac", ".webm", ".mkv", ".mov", ".avi", ".wma"
}


@dataclass
class MediaDownloadResult:
    local_path: str
    title: str
    duration_seconds: Optional[float]
    mime_type: str
    source_url: str


class MediaDownloaderError(Exception):
    """Base exception for media download errors."""
    pass


class MediaDownloader:
    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or settings.temp_dir
        os.makedirs(self.temp_dir, exist_ok=True)

    @staticmethod
    def is_youtube_url(url: str) -> bool:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        return "youtube.com" in domain or "youtu.be" in domain

    @staticmethod
    def is_local_path(url: str) -> bool:
        if url.startswith("file://"):
            return True
        return os.path.exists(url)

    async def download(self, target: str) -> MediaDownloadResult:
        """
        Download media from YouTube, direct URL, or return local file information.
        """
        if self.is_local_path(target):
            return self._handle_local_file(target)

        if self.is_youtube_url(target):
            return await self._download_youtube(target)

        # Fallback to direct HTTP download or yt-dlp auto-detection
        try:
            return await self._download_direct_http(target)
        except Exception as e:
            log.info("direct_download_fallback_to_ytdlp", target=target, error=str(e))
            return await self._download_youtube(target)

    def _handle_local_file(self, target: str) -> MediaDownloadResult:
        file_path = target.replace("file://", "") if target.startswith("file://") else target
        if not os.path.exists(file_path):
            raise MediaDownloaderError(f"Local media file not found: {file_path}")

        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()
        mime_type = f"audio/{ext.lstrip('.')}" if ext in {".mp3", ".wav", ".m4a", ".ogg", ".flac"} else f"video/{ext.lstrip('.')}"

        from app.downloader.downloader import sanitize_filename

        raw_title = os.path.splitext(filename)[0]
        clean_title = sanitize_filename(raw_title)

        return MediaDownloadResult(
            local_path=file_path,
            title=clean_title,
            duration_seconds=None,
            mime_type=mime_type,
            source_url=target,
        )

    async def _download_youtube(self, url: str) -> MediaDownloadResult:
        import yt_dlp
        from app.downloader.downloader import sanitize_filename

        output_template = os.path.join(self.temp_dir, "%(id)s.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
            "quiet": True,
            "no_warnings": True,
        }

        def _exec_ytdlp():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                # FFmpegExtractAudio converts output to mp3 extension
                base, _ = os.path.splitext(filename)
                mp3_path = base + ".mp3"
                if not os.path.exists(mp3_path):
                    mp3_path = filename
                return mp3_path, info.get("title", "audio"), info.get("duration")

        try:
            import asyncio
            loop = asyncio.get_running_loop()
            mp3_path, title, duration = await loop.run_in_executor(None, _exec_ytdlp)
            clean_title = sanitize_filename(title or "audio")
            return MediaDownloadResult(
                local_path=mp3_path,
                title=clean_title,
                duration_seconds=float(duration) if duration else None,
                mime_type="audio/mp3",
                source_url=url,
            )
        except Exception as err:
            log.error("youtube_download_failed", url=url, error=str(err))
            raise MediaDownloaderError(f"Failed to download audio via yt-dlp: {err}") from err

    async def _download_direct_http(self, url: str) -> MediaDownloadResult:
        parsed = urlparse(url)
        path = parsed.path
        filename = os.path.basename(path) or "downloaded_media.mp3"
        dest_path = os.path.join(self.temp_dir, filename)

        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(response.content)

        ext = os.path.splitext(dest_path)[1].lower()
        content_type = response.headers.get("content-type", f"audio/{ext.lstrip('.')}")

        return MediaDownloadResult(
            local_path=dest_path,
            title=os.path.splitext(filename)[0],
            duration_seconds=None,
            mime_type=content_type,
            source_url=url,
        )
