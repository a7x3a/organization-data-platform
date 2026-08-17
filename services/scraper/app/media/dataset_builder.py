"""
Dataset Builder Module.

Compiles transcribed audio chunks into structured Speech-To-Text (STT) and
Text-To-Speech (TTS) datasets in JSONL format, along with full text transcripts.
"""
import json
import os
from dataclasses import asdict
from typing import Dict, List, Optional

import structlog

from app.media.downloader import MediaDownloadResult
from app.media.gemini_transcriber import ChunkTranscription

log = structlog.get_logger(__name__)


class DatasetBuilder:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def build_dataset(
        self,
        media_info: MediaDownloadResult,
        transcriptions: List[ChunkTranscription],
    ) -> Dict[str, str]:
        """
        Build STT, TTS, and full transcript datasets from chunk transcriptions.
        Returns a dictionary of generated dataset file paths.
        """
        stt_path = os.path.join(self.output_dir, "stt_dataset.jsonl")
        tts_path = os.path.join(self.output_dir, "tts_dataset.jsonl")
        full_transcript_path = os.path.join(self.output_dir, "full_transcript.txt")

        # 1. Build STT Dataset (JSONL)
        stt_entries = []
        full_transcript_lines = []

        for item in sorted(transcriptions, key=lambda x: x.chunk_index):
            chunk_filename = os.path.basename(item.audio_file_path)
            duration = round(item.end_seconds - item.start_seconds, 2)

            stt_record = {
                "chunk_id": f"{media_info.title}_chunk_{item.chunk_index:03d}",
                "audio_filename": chunk_filename,
                "start_seconds": item.start_seconds,
                "end_seconds": item.end_seconds,
                "duration_seconds": duration,
                "transcript": item.transcript,
                "speaker": item.speaker or "Speaker",
                "language": item.language,
                "source_title": media_info.title,
                "source_url": media_info.source_url,
            }
            stt_entries.append(stt_record)
            full_transcript_lines.append(f"[{item.start_seconds:.1f}s - {item.end_seconds:.1f}s] {stt_record['speaker']}: {item.transcript}")

        with open(stt_path, "w", encoding="utf-8") as f:
            for entry in stt_entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # 2. Build TTS Dataset (JSONL)
        tts_entries = []
        for entry in stt_entries:
            tts_record = {
                "id": entry["chunk_id"],
                "text_prompt": entry["transcript"],
                "audio_reference": entry["audio_filename"],
                "duration_seconds": entry["duration_seconds"],
                "speaker_id": entry["speaker"],
            }
            tts_entries.append(tts_record)

        with open(tts_path, "w", encoding="utf-8") as f:
            for entry in tts_entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # 3. Build Full Text Transcript
        with open(full_transcript_path, "w", encoding="utf-8") as f:
            f.write(f"Source: {media_info.title}\nURL: {media_info.source_url}\n\n")
            f.write("\n".join(full_transcript_lines))

        log.info(
            "dataset_built_successfully",
            stt_records=len(stt_entries),
            stt_path=stt_path,
            tts_path=tts_path,
        )

        return {
            "stt_dataset": stt_path,
            "tts_dataset": tts_path,
            "full_transcript": full_transcript_path,
        }
