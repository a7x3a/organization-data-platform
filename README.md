# Organization Data Platform

> **Web Collection System** — Phase 1: Foundation

A production-ready web data collection platform that discovers, validates, hashes, and stores raw web data in Cloudflare R2 `00_raw`.

---

## Architecture

```
React + Vite (shadcn/ui)
        ↓
Express API (TypeScript + Prisma)
        ↓
    ┌───┴───────────────┐
    ▼                   ▼
PostgreSQL           Redis (BullMQ)
(metadata/state)     (job queue)
                        ▼
                  Python Scraper
               (Scrapy + Playwright)
                        ↓
                 Cloudflare R2
                   (00_raw)
```

## Monorepo Structure

```
organization-data-platform/
├── apps/web/           # React + Vite dashboard
├── services/api/       # Express REST API
├── services/scraper/   # Python scraper worker
├── packages/
│   ├── database/       # Prisma schema + migrations
│   └── shared-types/   # Shared TypeScript types
└── infra/docker/       # Nginx, init scripts
```

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker Desktop

### 1. Configure environment
```bash
cp .env.example .env
# Edit .env — fill in R2 credentials and auth secrets
```

### 2. Start development stack
```bash
npm run dev
```

This starts:
- `web` at http://localhost:3000
- `api` at http://localhost:4000
- `postgres` at localhost:5432
- `redis` at localhost:6379
- `scraper` (background worker)

### 3. Run database migrations
```bash
npm run db:migrate
```

## Services

| Service | Tech | Port |
|---|---|---|
| web | React + Vite | 3000 |
| api | Express + TypeScript | 4000 |
| postgres | PostgreSQL 16 | 5432 |
| redis | Redis 7 | 6379 |
| scraper | Python 3.12 | — |

## Key Design Principles

- `00_raw` is **immutable** — never overwrite a previous collection run
- SHA-256 is the **only** exact-content identity
- Scraping happens **only** in the Python worker, never in the API
- R2 credentials **never** reach the frontend
- All operations are **idempotent** and safe to retry
