# Organization Data Platform

> **Production-Grade Data Collection & Processing Platform**
> Automated web, Telegram, media/voice transcription, and document collection with quality inspection, hashing, and Cloudflare R2 / local immutable storage.

---

## Architecture

```
                 React + Vite Web Dashboard (apps/web)
                                  │
                                  ▼
                   Express REST API (services/api)
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
            PostgreSQL (16)               Redis (7)
            (metadata/state)             (BullMQ queue)
                                               │
                                               ▼
                                      Python Scraper Worker
                                       (services/scraper)
                                               │
                ┌──────────────────────────────┼──────────────────────────────┐
                ▼                              ▼                              ▼
      Web Crawling Engine            Telegram Channel Scraper       Media & Voice Transcriber
    (Playwright + Scrapy)                  (Telethon)                 (yt-dlp + Gemini API)
                │                              │                              │
                └──────────────────────────────┼──────────────────────────────┘
                                               │
                                               ▼
                                      Immutable Storage
                                (Cloudflare R2 / Local 00_raw)
```

---

## Monorepo Layout

```
organization-data-platform/
├── apps/
│   └── web/                   # React + Vite frontend dashboard (Port 3000)
├── services/
│   ├── api/                   # Express + TypeScript REST API (Port 4000)
│   └── scraper/               # Python collection worker (Web, Telegram, Media, PDF)
├── packages/
│   ├── database/              # Prisma schema, migrations, and database client
│   └── shared-types/          # Shared TypeScript interfaces & enums
├── infra/
│   └── docker/                # Nginx configuration and Docker init scripts
├── docker-compose.yml         # Production Docker Compose orchestration
└── docker-compose.dev.yml     # Development Docker Compose stack
```

---

## Features & Capabilities

- **PDF Extraction & Quality Classifier**:
  - Automatically inspects fetched PDF documents.
  - Measures printable text density, text yield, and page quality score.
  - Automatically routes high-quality digital text PDFs to `pdf/native` and scanned/image PDFs to `pdf/ocr`.
- **Media, YouTube & Voice Transcription Pipeline**:
  - Downloads YouTube videos, direct video/audio URLs, and local media using `yt-dlp`.
  - Splits audio into 30-second chunks using `AudioChunker`.
  - Transcribes audio chunks using Google Gemini API (or offline fallback) into Speech-to-Text (`stt_dataset.jsonl`), Text-to-Speech (`tts_dataset.jsonl`), and full verbatim transcripts.
- **Telegram Channel Collector**:
  - Iterates Telegram channel messages via user account session (Telethon).
  - Downloads channel media and records message artifacts.
- **Web Crawler Engine**:
  - Supports both standard HTTP streaming crawler and Playwright browser crawler for JavaScript SPAs.

---

## Docker & Compose Commands (Reference)

### 1. Production Docker Compose (Full Stack)

Start all services (PostgreSQL, Redis, API, Scraper, Web):

```bash
# Build and start all services in detached mode
docker compose up --build -d

# View live logs for all services
docker compose logs -f

# View status of running containers
docker compose ps

# View logs for a specific service (e.g. scraper or api)
docker compose logs -f scraper

# Stop and remove containers and networks
docker compose down

# Stop and remove containers, networks, and volumes
docker compose down -v
```

> *Note: For legacy Docker Compose v1, replace `docker compose` with `docker-compose`.*

---

### 2. Development Docker Compose Stack

Run database, Redis, API, and scraper in development mode with live code mounts:

```bash
# Start development stack
docker compose -f docker-compose.dev.yml up --build -d

# View scraper logs in development
docker compose -f docker-compose.dev.yml logs -f scraper

# Stop development stack
docker compose -f docker-compose.dev.yml down
```

---

### 3. Individual Docker Build & Run Commands

If you need to build and run containers individually:

#### Express API Service (`services/api`)
```bash
# Build API image
docker build -t odp-api -f services/api/Dockerfile .

# Run API container
docker run -d \
  --name odp-api \
  -p 4000:4000 \
  --env-file .env \
  odp-api
```

#### Python Scraper Worker (`services/scraper`)
```bash
# Build Scraper image
docker build -t odp-scraper -f services/scraper/Dockerfile .

# Run Scraper container
docker run -d \
  --name odp-scraper \
  --env-file .env \
  odp-scraper
```

#### React Web Dashboard (`apps/web`)
```bash
# Build Web Dashboard image
docker build -t odp-web -f apps/web/Dockerfile .

# Run Web Dashboard container
docker run -d \
  --name odp-web \
  -p 3000:80 \
  odp-web
```

---

## Local Quick Start (Without Full Docker)

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker Desktop (for Postgres & Redis)

### Step 1: Configure Environment
```bash
cp .env.example .env
# Fill in AUTH_ACCESS_SECRET, AUTH_REFRESH_SECRET, and storage settings
```

### Step 2: Start Postgres & Redis Services
```bash
docker compose up -d postgres redis
```

### Step 3: Run Database Migrations
```bash
npm run db:migrate
```

### Step 4: Start Web & API Development Servers
```bash
npm run dev
```

### Step 5: Start Python Scraper Worker
On Windows:
```cmd
cd services/scraper
.venv\Scripts\python.exe -m app.main
```

On Linux / macOS:
```bash
cd services/scraper
source .venv/bin/activate
python -m app.main
```

---

## Testing & Verification

Run the Python scraper unit test suite (87+ tests):

```bash
# Windows
cd services/scraper
.venv\Scripts\python.exe -m pytest -v

# Linux / macOS
cd services/scraper
pytest -v
```

---

## Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Runtime environment (`development` / `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://odp_user:odp_password@postgres:5432/odp_db` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |
| `STORAGE_PROVIDER` | Storage backend (`local` or `r2`) | `local` |
| `LOCAL_STORAGE_DIR` | Directory for local file storage | `/app/storage` |
| `R2_ENDPOINT` | Cloudflare R2 S3 Endpoint URL | — |
| `R2_BUCKET` | Cloudflare R2 bucket name | `organization-data` |
| `TELEGRAM_API_ID` | Telegram API ID from my.telegram.org | — |
| `TELEGRAM_API_HASH` | Telegram API Hash from my.telegram.org | — |
| `TELEGRAM_SESSION_STRING` | User authorization session string | — |
| `GEMINI_API_KEY` | Google Gemini API key for audio transcription | — |
