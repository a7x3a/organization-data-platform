# Organization Data Platform (ODP)

A unified, automated platform for harvesting, processing, categorizing, transcribing, and storing digital resources (Documents, Web pages, Telegram channels, Media/Voice audio, Ebooks, and Datasets).

---

## 🎯 Key Capabilities

- **Multi-Source Scraping**: Harvest content from standard websites, JavaScript SPAs, Wix sites (`usrfiles.com`), Cloudflare-protected sites, and Telegram channels.
- **Adaptive Stealth Engine**: Powered by **Scrapling** and **Playwright Chromium** with automatic Cloudflare Turnstile challenge solving.
- **Smart File Filtering & Categorization**: Automatically filters non-content assets, checks file types, inspects text density in PDFs, detects languages, and categorizes content.
- **Media & Audio Datasets**: Download YouTube videos and podcasts via `yt-dlp`, chunk audio, and transcribe them into Speech-to-Text (STT) and Text-to-Speech (TTS) datasets.
- **Deduplication & Immutable Storage**: Deduplicates files by SHA-256 hash and writes structured `metadata.jsonl` and `manifest.json` reports to Cloudflare R2 or local storage.

---

## 📥 How Files Are Downloaded, Filtered & Categorized

The platform uses a 4-stage pipeline to ensure only clean, high-quality, non-duplicate files are collected and organized:

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  1. Discovery   │ ──► │  2. Filtering &     │ ──► │ 3. Download &        │ ──► │ 4. Categorize &  │
│  & Domain Check │     │     FileType Rules  │     │    Deduplication     │     │    Store Metadata│
└─────────────────┘     └─────────────────────┘     └──────────────────────┘     └──────────────────┘
```

### 1. Discovery & Domain Safety
- **Domain Scoping**: Confines crawling to the target source domain so the crawler never escapes to external websites.
- **Trusted Asset CDNs**: Automatically permits files hosted on trusted document/media CDNs (`cdn.gov.krd`, `usrfiles.com`, `wixstatic.com`, `drive.google.com`, `archive.org`).
- **SSRF Protection**: Validates all URLs against private IP ranges (`127.0.0.1`, `10.0.0.0/8`, metadata APIs) for security.

### 2. File Filtering & FileType Rules
- **Allowed Extensions**: Identifies document formats (`.pdf`, `.epub`, `.docx`, `.xlsx`, `.zip`), audio/video (`.mp3`, `.wav`, `.mp4`), and datasets (`.csv`, `.parquet`, `.jsonl`).
- **Asset Noise Removal**: Automatically skips page furniture and theme files (`.css`, `.js`, `.ico`, `.woff`, `.svg`).
- **Regex Rules**: Enforces custom URL inclusion and exclusion patterns defined in the collector configuration.

### 3. Streaming Download & Deduplication
- **Memory-Efficient Streaming**: Downloads files in chunked streams to keep RAM usage low even for large files.
- **SHA-256 Deduplication**: Calculates file hashes on-the-fly and skips duplicate downloads instantly against prior runs.

### 4. Classification & Quality Categorization
- **PDF Yield Classification**: Analyzes PDF text content to separate **Native Digital Text** from **Scanned Image PDFs** (marking scanned files for downstream OCR).
- **Language Detection**: Identifies document languages (Kurdish, Arabic, English, Persian).
- **Kurdish Content Categorization**: Categorizes text into domains (e.g., Literature, History, Law, Religion, Science) with quality scores.
- **Clean Unicode Filenames**: Preserves Kurdish and Arabic script filenames cleanly without corruption.

---

## 📂 Project Structure

```
organization-data-platform/
├── apps/
│   └── web/                      # React + Vite frontend dashboard
│       ├── src/pages/            # Collectors, Files, Data Browser, Users, Upload
│       └── src/components/       # Reusable UI components
├── services/
│   ├── api/                      # Express + TypeScript REST API
│   │   ├── src/routes/           # API endpoints (collectors, runs, files, stats)
│   │   └── src/services/         # BullMQ queue producers & database queries
│   └── scraper/                  # Python worker service
│       ├── app/
│       │   ├── discovery/        # Link, media, sitemap & robots.txt extractors
│       │   ├── downloader/       # Streaming HTTP downloader with retry logic
│       │   ├── media/            # Language detection, Kurdish categorization, quality scoring
│       │   ├── spiders/          # HTTP spider, Browser Playwright spider, Scrapling spider, CF bypass
│       │   ├── pipeline/         # Shared file pipeline (dedup, hash, upload)
│       │   └── storage/          # MetadataWriter (jsonl) & ManifestWriter (json)
│       └── tests/                # Pytest unit & integration test suite (105+ tests)
├── packages/
│   ├── database/                 # Prisma ORM schema & PostgreSQL migrations
│   └── shared-types/             # Shared TypeScript interfaces & enums
├── docker-compose.yml            # Production deployment orchestration
└── docker-compose.dev.yml        # Local development orchestration with live reloading
```

---

## 🚀 Quick Start

### Using Docker (Recommended)

1. Clone environment file:
   ```bash
   cp .env.example .env
   ```

2. Build and start all services:
   ```bash
   docker compose up --build -d
   ```

- **Web Dashboard**: `http://localhost:3000`
- **REST API**: `http://localhost:4000`

### Development Mode (With Live Reloading)

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Run the scraper test suite:

```bash
cd services/scraper
.venv\Scripts\python.exe -m pytest tests/
```
