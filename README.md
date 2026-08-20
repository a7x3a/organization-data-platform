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

## 🚀 Server Installation & Network Deployment Guide

Follow these steps to deploy and run the platform on your server PC so that any computer on your local network (LAN or Wi-Fi) can access the dashboard.

### Step 1: Prerequisites on the Server PC
Make sure the server PC has the following installed:
- **Docker** & **Docker Compose** ([Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) or `docker-ce` + `docker-compose-plugin` for Linux).
- Ensure Docker is running.

---

### Step 2: Copy the Project to Your Server
Either clone via Git or copy the project folder to your server PC:
```bash
git clone <YOUR_GIT_REPO_URL> organization-data-platform
cd organization-data-platform
```
*(If copying the folder manually, you can omit `node_modules`, `.venv`, and `.git` folders to keep transfer fast).*

---

### Step 3: Configure `.env`
Create your `.env` configuration from the template:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```

Open `.env` and verify key settings (the defaults work out of the box for local storage):
- `STORAGE_PROVIDER=local` (stores all downloads in `./storage` on the server disk).
- `AUTH_ACCESS_SECRET` & `AUTH_REFRESH_SECRET` (generate any random secret strings for security).

---

### Step 4: Start All Services with Docker
Build and launch all 5 microservices in the background:

```bash
docker compose up --build -d
```

> **Automated Setup:** On startup, the database migrations run automatically and the default admin user is created.

---

### Step 5: Access the Dashboard from Any Device on Your Network

1. **Find your Server PC's IP address:**
   - **Windows:** Open Command Prompt/PowerShell and run `ipconfig` (find your **IPv4 Address**, e.g., `192.168.1.150`).
   - **Linux:** Run `hostname -I` or `ip addr show`.

2. **Ensure Port 3000 is open in Firewall:**
   - Allow inbound traffic on TCP port **3000** through your server's firewall.

3. **Open in any Browser:**
   Navigate to:
   ```
   http://<YOUR_SERVER_IP>:3000
   ```
   *(Example: `http://192.168.1.150:3000`)*

---

### 🔑 Default Login Credentials

| Role | Username | Default Password |
| :--- | :--- | :--- |
| **Administrator** | `admin` | `admin12345` |
| **Alternate Admin** | `a7x3a` | `admin12345` |

> 💡 *Once logged in, you can change passwords or manage users from the **Users** tab.*

---

## 🛠️ Handy Server Management Commands

| Action | Command |
| :--- | :--- |
| **Check container status** | `docker compose ps` |
| **View real-time logs** | `docker compose logs -f` |
| **View scraper engine logs** | `docker compose logs -f scraper` |
| **View API logs** | `docker compose logs -f api` |
| **Restart all services** | `docker compose restart` |
| **Stop all services** | `docker compose down` |
| **Update & Rebuild** | `git pull && docker compose up --build -d` |

---

## 🔄 Clean Reset & Rebuild (Fix Broken or Stale Builds)

If a previous Docker build failed, corrupted cache layers, or containers fail to start (e.g., stale entrypoints or cache mismatch), run this complete clean rebuild:

### 1. Stop and remove existing containers:
```bash
docker compose down --remove-orphans
```

### 2. (Optional) Wipe database volumes for a fresh start:
> ⚠️ **Warning:** This removes existing database data so fresh migrations and default admins re-initialize from scratch.
```bash
docker compose down -v --remove-orphans
```

### 3. Rebuild all images from scratch (ignoring old cache):
```bash
docker compose build --no-cache
```

### 4. Start all services in the background:
```bash
docker compose up -d
```

### 5. Check container health:
```bash
docker compose ps
docker compose logs -f
```

---

## 📥 How Files Are Downloaded, Filtered & Categorized

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  1. Discovery   │ ──► │  2. Filtering &     │ ──► │ 3. Download &        │ ──► │ 4. Categorize &  │
│  & Domain Check │     │     FileType Rules  │     │    Deduplication     │     │    Store Metadata│
└─────────────────┘     └─────────────────────┘     └──────────────────────┘     └──────────────────┘
```

1. **Discovery & Domain Safety**: Confines crawling to target domains, permits trusted CDNs (`cdn.gov.krd`, `usrfiles.com`, `drive.google.com`, etc.), with built-in SSRF protection against private IP probing.
2. **File Filtering & Rules**: Extracts documents (`.pdf`, `.epub`, `.docx`), audio/video (`.mp3`, `.wav`, `.mp4`), and datasets (`.csv`, `.parquet`, `.jsonl`) while eliminating web assets (`.css`, `.js`, `.woff`).
3. **Streaming Download & Deduplication**: Streams downloads to conserve RAM and computes SHA-256 hashes to prevent redundant downloads.
4. **Classification & Categorization**: Differentiates native digital PDFs from scanned image PDFs, detects languages (Kurdish, Arabic, English, Persian), and applies Kurdish topic classification with clean Unicode preservation.

---

## 📂 Project Structure

```
organization-data-platform/
├── apps/
│   └── web/                      # React + Vite dashboard (served via Nginx on port 3000)
├── services/
│   ├── api/                      # Express + TypeScript REST API (port 4000)
│   └── scraper/                  # Python worker (Playwright, Scrapling, yt-dlp, Telethon)
├── packages/
│   ├── database/                 # Prisma ORM schema & PostgreSQL migrations
│   └── shared-types/             # Shared TypeScript models & enums
├── storage/                      # Local persistent storage for scraped content & manifests
├── docker-compose.yml            # Production deployment orchestration
└── docker-compose.dev.yml        # Local development orchestration with hot reloading
```

---

## 💻 Local Development Mode

If you are developing locally with hot reloading enabled:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Run Scraper unit and integration tests:
```bash
cd services/scraper
.venv\Scripts\python.exe -m pytest tests/
```
