# Web Collection Platform — Production Implementation Plan

> **Purpose:** Build the first production-ready component of the Organization Data Platform: a web collection system that discovers, validates, hashes, and stores raw web data in Cloudflare R2 `00_raw`.
>
> **Important:** This implementation is ONLY the collection system. Do not build OCR, ASR, normalization, semantic deduplication, PII filtering, dataset generation, training, or release management yet.

---

## 1. Core Architecture

The larger platform has seven immutable zones:

```text
00_raw
   ↓
10_extracted
   ↓
20_normalized
   ↓
30_deduplicated
   ↓
40_filtered
   ↓
50_dataset
   ↓
60_release
```

Never modify an earlier zone.

For this project, stop at:

```text
WEB
 ↓
COLLECTION SYSTEM
 ↓
Find → Check → Download → Validate
 ↓
SHA-256 + Metadata
 ↓
Cloudflare R2 / 00_raw
```

The collector must remain independent from future processing services.

### Core principle

```text
Collectors collect.
R2 stores.
Processors transform.
The database tracks everything.
```

---

# 2. Technology Stack

## Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- Zod where client-side validation is useful

Do NOT use Next.js.

The frontend must communicate only with the backend API.

```text
React Dashboard
      ↓
Backend API
```

It must never contain R2 credentials.

---

## Backend API

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- BullMQ
- Redis
- AWS SDK for S3-compatible Cloudflare R2 access
- Zod for request validation

Responsibilities:

- Authentication and authorization
- Sources
- Collectors
- Collection runs
- Job creation/cancellation
- Metadata
- File records
- R2 access
- Signed download URLs where required
- Dashboard statistics
- Audit events
- Health/readiness endpoints

---

## Scraper Worker

Use a separate Python service:

- Python 3.12+
- Scrapy
- Playwright
- httpx
- boto3
- pydantic where useful

Use Scrapy/httpx for normal HTTP pages.

Use Playwright ONLY for JavaScript-heavy pages that cannot be collected reliably with normal HTTP requests.

Do not run a browser for every URL.

---

## Infrastructure

Development:

- Docker Compose
- PostgreSQL container
- Redis container
- API container
- React development container if desired
- Python scraper worker container

Cloudflare R2 remains an external object store.

Do NOT introduce Kubernetes yet.

The architecture must be Kubernetes-ready later.

---

# 3. Repository Structure

Use one monorepo while keeping services clearly separated.

```text
organization-data-platform/
│
├── apps/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── layouts/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── api/
│       │   └── types/
│       ├── public/
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── services/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── queues/
│   │   │   ├── jobs/
│   │   │   ├── repositories/
│   │   │   ├── schemas/
│   │   │   ├── utils/
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   └── scraper/
│       ├── app/
│       │   ├── spiders/
│       │   ├── browser/
│       │   ├── downloader/
│       │   ├── storage/
│       │   ├── hashing/
│       │   ├── metadata/
│       │   ├── jobs/
│       │   ├── config/
│       │   └── main.py
│       ├── tests/
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   ├── database/
│   │   ├── prisma/
│   │   └── package.json
│   └── shared-types/
│
├── infra/
│   └── docker/
│
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── .dockerignore
└── README.md
```

Do not create artificial microservices for every small feature.

Keep the API as one service and the scraper as one worker service initially.

---

# 4. System Boundaries

## React

Responsible for:

- Dashboard
- Source management UI
- Collector configuration UI
- Run controls
- Run monitoring
- File browsing
- Error display
- User management UI according to permissions

Not responsible for:

- Scraping
- R2 credentials
- File processing
- Hashing
- Queue management

---

## Express API

Responsible for:

- Business logic
- Database operations
- Queue creation
- Authentication
- Authorization
- R2 operations
- Collection lifecycle

Not responsible for performing long-running scraping directly.

---

## Python Scraper

Responsible for:

```text
Discover
 ↓
Check
 ↓
Download
 ↓
Validate
 ↓
Hash
 ↓
Upload raw object
 ↓
Report metadata/result
```

It must NOT perform:

- OCR
- ASR
- LLM inference
- semantic extraction
- normalization
- semantic/near-duplicate detection
- PII detection
- dataset creation
- training

---

# 5. Cloudflare R2 Design

Use one main bucket, for example:

```text
organization-data
```

Structure:

```text
organization-data/
│
├── 00_raw/
│   ├── web/
│   ├── telegram/
│   ├── apps/
│   ├── api/
│   ├── manual/
│   └── external/
│
├── 10_extracted/
├── 20_normalized/
├── 30_deduplicated/
├── 40_filtered/
├── 50_dataset/
└── 60_release/
```

Only implement `00_raw/web` now.

---

# 6. Web Raw Storage Structure

Every collection execution gets its own immutable run.

```text
00_raw/
└── web/
    └── {source_slug}/
        └── {run_id}/
            ├── files/
            │   ├── file-a.pdf
            │   ├── file-b.jpg
            │   └── file-c.html
            │
            ├── metadata.jsonl
            └── manifest.json
```

Example:

```text
00_raw/web/kurdish-books/2026-08-12_run_000001/files/book.pdf
```

Do not overwrite previous runs.

If the same source is scraped again, create another run.

---

# 7. File Identity

Never use filename as identity.

Every collected object must have:

```text
file_id
sha256
```

Example:

```text
file_id = RAW-000000001
sha256  = <64-character SHA-256>
```

`file_id` is the permanent internal identity.

SHA-256 is the exact-content fingerprint.

---

# 8. Exact Duplicate Strategy

Use multiple checks.

## Before downloading where possible

Check:

1. Source URL
2. Known source metadata
3. HTTP metadata such as ETag/Last-Modified when available

Do not blindly trust these as content identity.

## After download

Calculate SHA-256.

```text
SHA256(new file)
      ↓
Existing SHA256?
      ↓
Yes → exact duplicate
No  → new raw file
```

Do NOT use semantic similarity or embeddings here.

Near-duplicate detection belongs to `30_deduplicated`.

---

# 9. Database Model

Use PostgreSQL.

The database stores metadata and system state.

R2 stores actual objects.

Core entities:

```text
User
Role
Source
Collector
CollectionRun
CollectedFile
CollectionError
AuditLog
```

Prepare the schema so future entities can be added:

```text
ProcessingJob
QualityCheck
DeduplicationRecord
QuarantineRecord
Dataset
Release
Lineage
```

Do not implement future processing tables unless they are required for a clean foreign-key design.

---

# 10. Source

A source represents a website.

Suggested fields:

```text
id
name
slug
base_url
description
enabled
robots_policy
created_at
updated_at
```

Example:

```text
Name: Kurdish Books
Slug: kurdish-books
Base URL: https://example.com
```

Use a unique slug.

---

# 11. Collector

A collector represents a reusable scraping configuration.

Suggested fields:

```text
id
source_id
name
type
version
enabled
schedule
configuration
created_at
updated_at
```

For this project:

```text
type = WEB
```

Configuration should support:

```text
start_urls
allowed_domains
allowed_url_patterns
excluded_url_patterns
allowed_extensions
allowed_mime_types
max_depth
max_pages
max_files
request_delay_ms
concurrency
request_timeout_seconds
max_retries
use_browser
robots_enabled
```

Do not hardcode these values into the application.

---

# 12. Collection Run

Every execution creates a `CollectionRun`.

Fields:

```text
id
collector_id
source_id
run_id
status
started_at
completed_at
files_found
files_downloaded
files_skipped
files_duplicate
files_failed
pages_crawled
error_count
collector_version
manifest_r2_key
created_at
```

Statuses:

```text
PENDING
RUNNING
COMPLETED
FAILED
CANCEL_REQUESTED
CANCELLED
```

`run_id` must be unique.

---

# 13. Collected File

Suggested fields:

```text
id
file_id
collection_run_id
source_id
source_url
final_url
file_name
extension
mime_type
file_size
sha256
r2_key
status
etag
last_modified
discovered_at
downloaded_at
created_at
```

File status:

```text
DISCOVERED
DOWNLOADING
UPLOADED
DUPLICATE
SKIPPED
FAILED
```

Use database indexes on:

```text
sha256
source_url
collection_run_id
source_id
status
created_at
```

Use unique constraints where appropriate.

Do not make `source_url` globally unique because a URL may legitimately change over time.

---

# 14. Metadata JSONL

Each run must produce:

```text
metadata.jsonl
```

One record per collected file.

Example:

```json
{
  "file_id": "RAW-000000001",
  "source": "web",
  "source_name": "kurdish-books",
  "file_name": "sample1.pdf",
  "file_type": ".pdf",
  "mime_type": "application/pdf",
  "file_size": 1234567,
  "sha256": "abc123...",
  "date_downloaded": "2026-08-12T09:55:06+03:00",
  "source_url": "https://example.com/sample1.pdf",
  "final_url": "https://example.com/files/sample1.pdf",
  "r2_key": "00_raw/web/kurdish-books/2026-08-12_run_000001/files/sample1.pdf"
}
```

Do not store huge page contents inside metadata.

Metadata must remain lightweight.

---

# 15. Manifest

Each run must produce:

```text
manifest.json
```

It describes the entire run.

Example:

```json
{
  "run_id": "2026-08-12_run_000001",
  "source": "web",
  "source_name": "kurdish-books",
  "started_at": "2026-08-12T10:00:00+03:00",
  "completed_at": "2026-08-12T10:30:00+03:00",
  "files_found": 250,
  "files_downloaded": 238,
  "files_skipped": 0,
  "files_duplicate": 0,
  "files_failed": 12,
  "pages_crawled": 1000,
  "collector_version": "1.0.0",
  "status": "completed"
}
```

Difference:

```text
metadata.jsonl → individual files
manifest.json  → entire collection run
```

---

# 16. Scraping Architecture

Use two paths.

## Normal pages

```text
Scrapy/httpx
```

## JavaScript-heavy pages

```text
Playwright
```

Do not launch Chromium unless required.

This is critical for CPU, RAM, startup time, and throughput.

---

# 17. Discovery

Support:

- Start URLs
- Internal links
- Sitemap XML
- Pagination
- URL pattern filters
- Allowed domains
- Maximum crawl depth
- Maximum page count
- Maximum file count

Example:

```text
Start URL
   ↓
Fetch page
   ↓
Extract links
   ↓
Filter URLs
   ↓
Queue valid URLs
   ↓
Continue crawl
```

Do not crawl the entire internet.

Every collector must have explicit boundaries.

---

# 18. Download Rules

For each candidate:

```text
Discover
 ↓
Check URL/domain rules
 ↓
Check known source URL
 ↓
HEAD/metadata check when useful
 ↓
Download stream
 ↓
Validate response
 ↓
Detect MIME
 ↓
Calculate SHA-256
 ↓
Check exact duplicate
 ↓
Upload to R2
 ↓
Persist metadata
```

Do not load large files completely into RAM.

Use streaming I/O.

---

# 19. File Validation

Validate:

- HTTP status
- Content length when available
- Actual MIME type
- File size
- Download completion
- SHA-256

Do not trust only:

```text
.pdf
.jpg
.mp4
```

from the URL.

The actual response must be inspected.

Set configurable maximum file size.

If a file exceeds the configured limit:

```text
Reject
Record reason
Continue collection
```

---

# 20. R2 Upload Strategy

Use multipart uploads for large objects where appropriate.

For normal/small objects, direct streaming upload is sufficient.

Never buffer a large file fully in memory just to upload it.

R2 upload failures must be retryable.

Do not mark a file `UPLOADED` until the upload is confirmed.

After successful upload:

```text
Database metadata
      ↓
status = UPLOADED
```

---

# 21. Temporary Storage

Prefer streaming:

```text
HTTP response
   ↓
hash + temporary stream/file
   ↓
R2
```

If temporary disk storage is required:

- Use a dedicated temporary directory
- Clean it after successful upload
- Clean stale files on worker startup
- Never treat temporary storage as authoritative storage

The source of truth is R2.

---

# 22. Queue Architecture

Never run a long scraper from an Express request.

Use:

```text
React
 ↓
Express
 ↓
Create CollectionRun
 ↓
BullMQ
 ↓
Python Worker
```

The API returns the run ID immediately.

Example:

```text
POST /api/collectors/:id/run

→ 202 Accepted
→ { "runId": "..." }
```

---

# 23. Job Types

Design the queue so these jobs can exist independently:

```text
collection.start
collection.page
collection.download
collection.finalize
```

Do not over-fragment the system initially.

A practical first implementation can use one collection job per run and internal concurrency inside the scraper.

Keep the job model extensible.

---

# 24. Concurrency

Concurrency must be configurable per collector.

Example:

```text
concurrency = 8
request_delay_ms = 250
```

Do not set unlimited concurrency.

Use per-domain throttling.

Respect server capacity and robots policies.

---

# 25. Retry Strategy

Retry transient errors:

```text
408
429
500
502
503
504
network timeout
connection reset
```

Use exponential backoff with jitter.

Do not retry permanent errors indefinitely:

```text
400
401
403
404
unsupported file
file too large
invalid content
```

Make maximum attempts configurable.

---

# 26. Cancellation

A collection run must support cancellation.

Flow:

```text
User clicks Cancel
       ↓
API sets CANCEL_REQUESTED
       ↓
Worker checks cancellation state
       ↓
Stop discovery/download work
       ↓
Finalize current run
       ↓
CANCELLED
```

Never abruptly corrupt state.

---

# 27. Crash Recovery

Design for worker crashes.

If a worker dies:

```text
RUNNING
   ↓
Worker disappears
   ↓
Queue detects failure
   ↓
Job retries/restarts
```

Do not create duplicate files because a job was retried.

Use idempotent operations.

R2 keys and database operations must safely handle retries.

---

# 28. Idempotency

The same collection job may execute twice because of:

- retries
- worker crashes
- network failures
- user actions

The system must not create uncontrolled duplicates.

Use:

```text
run_id
file_id
sha256
source_url
r2_key
```

to make operations safe to repeat.

---

# 29. API Endpoints

Implement:

## Sources

```text
GET    /api/sources
POST   /api/sources
GET    /api/sources/:id
PATCH  /api/sources/:id
DELETE /api/sources/:id
```

## Collectors

```text
GET    /api/collectors
POST   /api/collectors
GET    /api/collectors/:id
PATCH  /api/collectors/:id
DELETE /api/collectors/:id
POST   /api/collectors/:id/run
POST   /api/collectors/:id/enable
POST   /api/collectors/:id/disable
```

## Runs

```text
GET    /api/runs
GET    /api/runs/:id
POST   /api/runs/:id/cancel
```

## Files

```text
GET    /api/files
GET    /api/files/:id
GET    /api/files/:id/download-url
```

## System

```text
GET /health
GET /ready
```

Use pagination on all list endpoints.

Never return unlimited database rows.

---

# 30. Frontend

Build a clean admin dashboard using shadcn/ui.

Pages:

```text
/dashboard
/sources
/collectors
/collectors/:id
/runs
/runs/:id
/files
/files/:id
/settings
```

## Dashboard

Show:

- Total sources
- Active collectors
- Running runs
- Files collected
- Duplicate count
- Failed files
- Recent collection runs
- Last successful runs

## Sources

Create/edit/enable/disable sources.

## Collectors

Configure:

- Start URLs
- Domain rules
- URL patterns
- file types
- depth
- limits
- concurrency
- delay
- retries
- browser mode
- schedule

Actions:

```text
Run
Enable
Disable
Edit
View runs
```

## Run details

Show live/polling progress:

```text
Status
Started
Duration
Pages crawled
Files found
Downloaded
Duplicates
Skipped
Failed
Current activity
```

Use TanStack Query for server state.

---

# 31. Authentication and RBAC

Implement authentication before production deployment.

Roles from the larger plan:

```text
ADMIN
DATA_MANAGER
COLLECTOR
REVIEWER
ML_ENGINEER
RESEARCHER
SERVICE_ACCOUNT
```

For this first collector implementation:

### Collector

- Login
- Run assigned collectors
- View collection jobs
- View their uploads/collected results
- See errors

### Data Manager

- Manage sources
- Manage collectors
- Monitor jobs
- View statistics

### Admin

- Full access

Do not give normal users direct R2 credentials.

---

# 32. Security

## Secrets

Use environment variables:

```env
NODE_ENV=
DATABASE_URL=
REDIS_URL=

R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

AUTH_SECRET=
```

Never commit secrets.

Provide `.env.example`.

---

## R2

Normal users must not receive permanent R2 credentials.

The API should generate short-lived/signed access where direct downloads are necessary.

Raw storage remains private.

---

# 33. Docker Architecture

Use Docker Compose for local development.

Services:

```text
web
api
scraper
postgres
redis
```

Example:

```text
docker compose
│
├── web
├── api
├── scraper
├── postgres
└── redis

Cloudflare R2
   ↑
external
```

---

# 34. Docker Optimization

Use multi-stage builds where useful.

## Node

Build dependencies separately from runtime.

Do not copy:

```text
node_modules
.git
.env
logs
tests
```

into production images unless needed.

Use:

```text
npm ci
```

for deterministic installation.

---

## Python

Use a slim Python base image.

Install only required runtime dependencies.

Playwright browser dependencies are heavier, so keep the scraper image separate from the API image.

Do not install Chromium into the Node API image.

---

## Docker Compose

Add:

- healthchecks
- restart policies appropriate for local/production
- named volumes for PostgreSQL/Redis
- isolated network
- environment variables
- service dependencies using health conditions where supported

Example dependency relationship:

```text
postgres healthy
      ↓
api starts

redis healthy
      ↓
api/scraper starts
```

Do not rely only on `depends_on` startup order.

---

# 35. PostgreSQL Optimization

Use indexes for high-frequency queries.

Important indexes:

```text
CollectedFile.sha256
CollectedFile.source_url
CollectedFile.collection_run_id
CollectedFile.status
CollectedFile.created_at

CollectionRun.collector_id
CollectionRun.status
CollectionRun.started_at

Collector.source_id
Collector.enabled
```

Use pagination.

Prefer cursor pagination for very large tables.

Avoid:

```text
SELECT *
```

for large list endpoints.

Return only fields required by the UI.

---

# 36. Redis/BullMQ Optimization

Configure:

- retry policy
- exponential backoff
- job retention
- stalled-job detection
- concurrency
- graceful shutdown

Do not keep millions of completed job records forever.

Retain enough history for operational debugging and keep permanent collection history in PostgreSQL.

---

# 37. API Performance

Use:

- async I/O
- connection pooling
- pagination
- request validation
- response compression where useful
- structured logging
- efficient database queries

Do not perform scraping inside API requests.

Do not perform large R2 downloads through the API if a signed URL can safely be provided.

---

# 38. Scraper Performance

Optimize in this order:

```text
1. Avoid unnecessary browser rendering
2. Use HTTP crawling for normal pages
3. Use controlled concurrency
4. Stream downloads
5. Hash incrementally
6. Avoid duplicate downloads
7. Reuse HTTP connections
8. Cache useful HTTP metadata
9. Use Playwright only when necessary
```

Do not optimize by simply increasing concurrency.

Higher concurrency can increase failures and get sources blocked.

---

# 39. Robots and Responsible Crawling

Support robots.txt.

Implement:

- configurable request delay
- per-domain concurrency
- retries with backoff
- timeouts
- user-agent identification
- crawl limits

Do not bypass:

- authentication
- CAPTCHA
- access controls
- robots restrictions

Do not build anti-bot bypassing.

---

# 40. Scheduling

Collectors should support:

```text
Manual
Hourly
Daily
Weekly
Cron
```

The scheduler must create a new `CollectionRun`.

Never reuse a previous run.

Example:

```text
Daily schedule
     ↓
Create new run
     ↓
Run scraper
     ↓
Write new immutable R2 run
```

---

# 41. Observability

Use structured JSON logs.

Every log should include relevant identifiers:

```text
service
run_id
collector_id
source_id
file_id
job_id
level
event
timestamp
duration
error
```

Useful events:

```text
collection_started
page_discovered
file_discovered
download_started
download_completed
duplicate_detected
r2_upload_started
r2_upload_completed
file_failed
collection_completed
collection_cancelled
```

Do not log secrets.

Do not log sensitive file contents.

---

# 42. Health Checks

API:

```text
GET /health
```

Basic process health.

Readiness:

```text
GET /ready
```

Check dependencies:

```text
PostgreSQL
Redis
```

Scraper worker should also expose/process a health mechanism suitable for Docker.

---

# 43. Testing

## Frontend

Test:

- forms
- collector configuration
- run controls
- loading states
- error states
- permissions

## API

Test:

- authentication
- authorization
- validation
- source CRUD
- collector CRUD
- run creation
- cancellation
- pagination
- R2 access

## Scraper

Test:

- URL filtering
- domain restrictions
- MIME detection
- file-size limits
- SHA-256
- duplicate detection
- retry logic
- cancellation
- R2 upload
- metadata generation
- manifest generation

## Integration

At minimum:

```text
Create source
 ↓
Create collector
 ↓
Start run
 ↓
Queue job
 ↓
Scraper collects test files
 ↓
SHA-256
 ↓
R2 upload
 ↓
Database metadata
 ↓
metadata.jsonl
 ↓
manifest.json
 ↓
Run completed
```

Use a test bucket/prefix for integration tests.

---

# 44. Error Handling

Every failure must be classified.

Example:

```text
NETWORK_ERROR
TIMEOUT
HTTP_ERROR
RATE_LIMITED
FORBIDDEN
NOT_FOUND
INVALID_CONTENT
FILE_TOO_LARGE
UNSUPPORTED_TYPE
HASH_ERROR
R2_UPLOAD_ERROR
DATABASE_ERROR
CANCELLED
```

Store a safe error message and structured error code.

Do not expose internal stack traces to users.

---

# 45. Data Lineage

Every raw file must be traceable:

```text
file_id
 ↓
collection_run_id
 ↓
collector_id
 ↓
source_id
 ↓
source_url
 ↓
r2_key
 ↓
sha256
```

This is required because future processing must be able to trace:

```text
Dataset record
 ↓
Processed record
 ↓
Extracted record
 ↓
Original raw file
 ↓
Original source
```

---

# 46. Future Compatibility

Do not implement these systems now:

```text
OCR
ASR
Vision processing
LLM extraction
Normalization
Near-duplicate detection
PII detection
Quality scoring
Licensing classification
Dataset generation
Training
SIE
Kubernetes
```

But the collector must be designed so future services can consume:

```text
00_raw
```

without modifying the collector.

Future pipeline:

```text
00_RAW
   ↓
10_EXTRACTED
   ↓
20_NORMALIZED
   ↓
30_DEDUPLICATED
   ↓
40_FILTERED
   ↓
50_DATASET
   ↓
60_RELEASE
```

---

# 47. Future Collector Types

The same collection interface must eventually support:

```text
WEB
TELEGRAM
API
APP
MANUAL
EXTERNAL
```

All collectors should eventually produce the same conceptual output:

```text
collection run
files
metadata.jsonl
manifest.json
00_raw
```

The web collector is simply the first implementation.

---

# 48. Development Phases

## Phase 1 — Foundation

Build:

```text
Monorepo
React/Vite
shadcn/ui
Express
PostgreSQL
Prisma
Redis
Docker Compose
Environment configuration
```

Acceptance:

- All services start with Docker Compose
- PostgreSQL is persistent
- Redis is persistent where appropriate
- API health checks work
- Frontend can reach API

---

## Phase 2 — R2

Build:

```text
R2 configuration
R2 client
Private bucket
Upload service
Signed download URL
```

Acceptance:

- API can upload a test object
- API can generate a safe download URL
- No R2 secret reaches frontend

---

## Phase 3 — Sources and Collectors

Build:

```text
Sources CRUD
Collectors CRUD
Validation
RBAC
```

Acceptance:

- Data Manager can create a source
- Data Manager can create a collector
- Collector configuration is persisted

---

## Phase 4 — Collection Runs

Build:

```text
CollectionRun
BullMQ
Job creation
Job status
Cancellation
Retry
```

Acceptance:

```text
POST run
 ↓
CollectionRun created
 ↓
Queue job created
 ↓
Worker executes
 ↓
Status updates
```

---

## Phase 5 — Python Scraper

Implement:

```text
Start URLs
Domain restrictions
URL filters
HTTP crawling
File discovery
Streaming downloads
MIME detection
SHA-256
```

Acceptance:

- Can scrape a controlled test website
- Can collect PDF/images/HTML
- Can calculate hashes
- Can reject oversized files

---

## Phase 6 — R2 Raw Storage

Implement:

```text
00_raw/web/{source}/{run}/files/
metadata.jsonl
manifest.json
```

Acceptance:

- Raw files are uploaded
- Previous runs are untouched
- Metadata is correct
- Manifest is correct
- R2 keys are deterministic

---

## Phase 7 — Duplicate Prevention

Implement:

```text
Source URL checks
SHA-256 checks
Idempotent retries
Duplicate statuses
```

Acceptance:

```text
Same file twice
 ↓
Only one new raw object
```

Near-duplicate detection is NOT part of this phase.

---

## Phase 8 — Playwright

Add browser mode only for collectors that need it.

Acceptance:

- Normal websites do not launch browser
- JS-heavy test website works
- Browser resources are cleaned correctly

---

## Phase 9 — Scheduling

Implement:

```text
Manual run
Cron/schedule
Run history
Last successful run
```

Acceptance:

- Scheduled collector creates a new run
- Failed run does not corrupt future runs

---

## Phase 10 — Production Hardening

Implement:

```text
Graceful shutdown
Health/readiness
Structured logging
Retry/backoff
Rate limits
Security
Docker optimization
Database indexes
Monitoring
Integration tests
```

Acceptance:

- Worker can restart safely
- Jobs can recover
- No raw data is overwritten
- Failures are visible
- Secrets are protected

---

# 49. Docker Production Rules

Use separate images:

```text
web image
api image
scraper image
```

Do not put everything in one container.

Do not run:

```text
PostgreSQL
Redis
API
Scraper
Frontend
```

inside one container.

One logical service per container.

Use Docker Compose to orchestrate them locally.

---

# 50. Graceful Shutdown

API:

```text
SIGTERM
 ↓
Stop accepting new requests
 ↓
Finish safe in-flight work
 ↓
Close DB
 ↓
Close Redis
 ↓
Exit
```

Scraper:

```text
SIGTERM
 ↓
Stop new crawling
 ↓
Finish safe active downloads
 ↓
Finalize state
 ↓
Close browser
 ↓
Close connections
 ↓
Exit
```

Never kill active jobs without updating state.

---

# 51. Configuration Rules

Never hardcode:

- URLs
- credentials
- R2 bucket
- concurrency
- delays
- limits
- retry counts
- environment-specific settings

Use environment/configuration.

Keep a safe `.env.example`.

Separate:

```text
development
test
production
```

---

# 52. Important Security Rules

The coding agent MUST NOT:

- Commit secrets
- Log credentials
- Put R2 secrets in React
- Give normal users permanent R2 credentials
- Disable TLS validation
- Bypass authentication
- Bypass CAPTCHA/access controls
- Ignore robots rules by default
- Execute arbitrary user-provided shell commands
- Allow unrestricted URL fetching from the backend

Protect against SSRF.

Collector URLs must be validated and controlled.

---

# 53. SSRF Protection

Because users can configure URLs, protect the scraper/backend against:

- localhost
- private IP ranges
- cloud metadata endpoints
- internal network addresses
- unexpected protocols

Allow only:

```text
http://
https://
```

unless a future feature explicitly requires another protocol.

Resolve DNS carefully and prevent redirects into blocked private networks.

---

# 54. Performance Rules

The implementation must prioritize:

```text
Correctness
 ↓
Reliability
 ↓
Resource efficiency
 ↓
Throughput
```

Do not sacrifice data integrity for speed.

For large files:

```text
stream
 ↓
incremental hash
 ↓
upload
```

Avoid:

```text
download entire file into RAM
 ↓
hash
 ↓
upload
```

Use bounded concurrency.

Use connection reuse.

Use browser workers only when required.

---

# 55. Database vs R2

Always keep this separation:

```text
R2
├── PDFs
├── Images
├── Audio
├── Video
├── HTML
└── JSON

PostgreSQL
├── Who?
├── Where?
├── When?
├── Which source?
├── Which run?
├── Which hash?
├── Which R2 key?
├── Status?
├── Errors?
└── Lineage?
```

Do not store large raw files in PostgreSQL.

---

# 56. Definition of Done

The first production-ready version is complete when a user can:

1. Log into the dashboard.
2. Create a web source.
3. Create a web collector.
4. Configure start URLs.
5. Configure domain and URL rules.
6. Configure file types.
7. Configure crawl limits.
8. Run the collector.
9. See a collection run created.
10. See the worker process the run.
11. Discover pages.
12. Discover downloadable files.
13. Download files using streaming.
14. Validate files.
15. Detect MIME type.
16. Calculate SHA-256.
17. Detect exact duplicates.
18. Upload new files to R2.
19. Store metadata in PostgreSQL.
20. Generate `metadata.jsonl`.
21. Generate `manifest.json`.
22. View run progress.
23. View errors.
24. Retry transient failures.
25. Cancel a run safely.
26. Restart the worker without corrupting data.
27. Run the same collector again without overwriting old raw data.
28. Trace every raw file back to its source URL and collection run.
29. Run the complete stack through Docker Compose.
30. Pass integration tests.

---

# 57. Rules for the Coding Agent

Follow these rules strictly.

### Architecture

- Do not use Next.js.
- Use React + Vite.
- Use shadcn/ui.
- Use Express for the API.
- Use Python for scraping.
- Keep API and scraper separate.
- Keep collection separate from processing.
- Do not introduce unnecessary microservices.

### Storage

- Use Cloudflare R2 for raw objects.
- Use PostgreSQL for metadata/state.
- Keep `00_raw` immutable.
- Never overwrite a previous collection run.
- Use SHA-256 for exact-content identity.
- Never use filename as identity.

### Scraping

- Use Scrapy/httpx for normal pages.
- Use Playwright only when necessary.
- Respect robots.txt and configured rate limits.
- Use bounded concurrency.
- Stream large files.
- Retry transient failures.
- Make operations idempotent.

### Docker

- Use Docker Compose for development.
- Use separate service images.
- Use multi-stage builds where useful.
- Keep images minimal.
- Use healthchecks.
- Use persistent database volumes.
- Never bake secrets into images.

### Reliability

- Every run must be recoverable.
- Every file must be traceable.
- Every important operation must be idempotent.
- Do not silently discard errors.
- Do not silently overwrite data.

### Scope

Do not implement future processing or AI features.

Stop at:

```text
00_raw
```

---

# 58. Final Target Architecture

```text
                         USER
                          │
                          ▼
                 React + Vite
                  shadcn/ui
                          │
                          ▼
                  Express API
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
     PostgreSQL         Redis          Cloudflare R2
      Metadata          BullMQ          00_RAW
          │               │                ▲
          │               ▼                │
          │        Python Scraper          │
          │        ┌──────────────┐        │
          │        │    Scrapy    │        │
          │        │      +       │        │
          │        │  Playwright  │        │
          │        └──────┬───────┘        │
          │               │                │
          │               ▼                │
          │              WEB ──────────────┘
          │
          └── Collection Runs / Files / Lineage / Audit
```

Future:

```text
R2 00_RAW
     ↓
10_EXTRACTED
     ↓
20_NORMALIZED
     ↓
30_DEDUPLICATED
     ↓
40_FILTERED
     ↓
50_DATASET
     ↓
60_RELEASE
     ↓
AI / Research / Training
```

Future scaling can add more scraper workers and eventually Kubernetes. AI inference infrastructure such as SIE belongs later, when model-serving workloads actually require it.

---

# 59. Final Engineering Principle

Build the first version simple, but design the boundaries correctly.

```text
React
  → controls the system

Express
  → manages the system

Redis/BullMQ
  → schedules work

Python Scraper
  → collects web data

PostgreSQL
  → tracks everything

Cloudflare R2
  → stores immutable raw data

Future processors
  → transform 00_raw

Future dataset system
  → creates AI datasets
```

The first milestone is NOT "build a huge distributed platform."

The first milestone is:

> **Reliably collect real web data, preserve the original files in immutable R2 `00_raw`, record complete metadata and lineage, survive retries/failures, and make every collection run reproducible.**
