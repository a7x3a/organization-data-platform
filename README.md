# Organization Data Platform (ODP)

A unified, automated platform for harvesting, processing, categorizing, transcribing, and storing digital resources (Documents, Web pages, Telegram channels, Media/Voice audio, Ebooks, and Datasets).

---

## 🎯 What Can It Be Used For?

- **Document & Ebook Collection**: Crawl websites, digital libraries, and CMS platforms (WordPress, Wix, Vercel, static HTML) to automatically extract PDFs, EPUBs, DOCX files, and office documents.
- **Adaptive Scrapling & Stealth Engine**: Integrates **Scrapling** (`scrapling[fetchers]`) with `AsyncFetcher`, `StealthyFetcher`, and `Selector` adaptors for self-healing, anti-bot protected, high-speed website crawling.
- **Wix & SPA Deep Discovery**: Extract documents and files embedded inside JavaScript single-page applications, Wix sites (`usrfiles.com`), Google Drive sharing links (`drive.google.com`), and cloud storage.
- **Media & Voice Dataset Creation**: Download YouTube videos, podcasts, and audio files via `yt-dlp`, chunk audio automatically, and transcribe them via Google Gemini API (or offline models) into **Speech-to-Text (STT)** and **Text-to-Speech (TTS)** datasets.
- **Telegram Archive Scraping**: Crawl and archive files, media, and message data directly from public and private Telegram channels via Telethon.
- **Automated Quality Inspection & PDF Classification**: Automatically inspect fetched PDFs, measure text yield, and split native digital text PDFs from scanned image PDFs (for OCR).
- **Kurdish & Arabic Text Processing**: Extract and preserve non-ASCII script filenames (Kurdish, Arabic, Persian) cleanly, with full metadata enrichment and quality scoring.

---

## ⚙️ How It Works

```
                        React + Vite Dashboard (apps/web)
                                       │
                                       ▼
                        Express REST API (services/api)
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                PostgreSQL (16)                   Redis (7)
                (Metadata & State)             (BullMQ Queue)
                                                      │
                                                      ▼
                                            Python Scraper Worker
                                             (services/scraper)
                                                      │
                ┌─────────────────────────────────────┼─────────────────────────────────────┐
                ▼                                     ▼                                     ▼
       Web Crawler Engine                    Telegram Channel Scraper               Media & Voice Pipeline
  (httpx + Scrapling + Playwright)                   (Telethon)                     (yt-dlp + Gemini STT/TTS)
                │                                     │                                     │
                └─────────────────────────────────────┼─────────────────────────────────────┘
                                                      │
                                                      ▼
                                              Immutable Storage
                                       (Cloudflare R2 / Local Storage)
```

1. **Job Scheduling & Dispatch**: Runs are launched via the Web Dashboard or API. Jobs are enqueued into Redis BullMQ.
2. **Resource Discovery**: The Python Scraper Worker crawls pages (using high-speed HTTP streaming or stealth Playwright Chromium for JS sites), parsing links, Wix state, JSON-LD schemas, and embedded media assets.
3. **Deduplication & Streaming Download**: Stream-downloads files, computes SHA-256 hashes incrementally, and skips duplicates against past runs.
4. **Metadata & Quality Scoring**: Inspects downloaded files (PDF yield classification, language detection, Kurdish categorization, quality scoring).
5. **Storage & Reporting**: Saves structured `metadata.jsonl` and `manifest.json` into organized raw storage (`00_raw/web/`, `00_raw/telegram/`, `00_raw/media/`) on Cloudflare R2 or local disk.

---

## 🚀 How To Use It

### Option A: Standard Setup with Docker (Recommended)

Start the entire platform (PostgreSQL, Redis, API, Scraper, Web Dashboard) with a single command:

```bash
# 1. Clone environment file
cp .env.example .env

# 2. Build and launch containers
docker compose up --build -d
```

- **Web Dashboard**: `http://localhost:3000`
- **REST API**: `http://localhost:4000`

---

### Option B: Development Setup (With Live Code Reloading)

To develop with live hot-reloading on the Web, API, and Scraper:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

To view logs for the scraper worker in development:

```bash
docker compose -f docker-compose.dev.yml logs -f scraper
```

To stop all services:

```bash
docker compose -f docker-compose.dev.yml down
```

---

## 🧪 Testing

Run the Python scraper worker test suite (105+ tests):

```bash
cd services/scraper
.venv\Scripts\python.exe -m pytest tests/
```

---

## 📂 Project Structure

```
organization-data-platform/
├── apps/
│   └── web/                   # React + Vite frontend dashboard
├── services/
│   ├── api/                   # Express + TypeScript REST API & Prisma DB client
│   └── scraper/               # Python worker (Web crawling, Telegram, Media STT/TTS)
├── packages/
│   ├── database/              # Prisma schema & PostgreSQL database migrations
│   └── shared-types/          # Shared TypeScript types & enums
├── docker-compose.yml         # Production orchestration
└── docker-compose.dev.yml     # Development orchestration
```
