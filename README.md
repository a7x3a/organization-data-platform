# QAI Data Platform

QAI Data Platform is a source-aware knowledge collection platform for websites, documents, PDFs, and Telegram text/document channels. It discovers content, filters unwanted resources, deduplicates files, extracts and normalizes text, records provenance, and stores manifests and metadata for downstream data preparation.

## What It Does

- Crawls standard websites and JavaScript-heavy sites through HTTP, browser, or Scrapling engines.
- Keeps crawling inside configured domains and protects requests from private-network and metadata-service access.
- Discovers documents, ebooks, datasets, images, and video links while excluding ordinary website assets.
- Classifies PDFs as digital text or OCR candidates using text density, printable ratio, and image evidence.
- Decodes supported Kurdish legacy-font text and normalizes Arabic-script Unicode.
- Detects language and script, scores file quality, and categorizes Kurdish content.
- Deduplicates files by SHA-256 and web pages by normalized content fingerprint.
- Preserves source URL, final URL, domain, subdomain, route, discovery context, and storage key.
- Writes `metadata.jsonl`, `manifest.json`, and structured web/document records.
- Supports local filesystem storage by default and Cloudflare R2 when explicitly configured.

Audio collection, YouTube collection, and transcription are intentionally disabled. Existing media code may remain for compatibility, but the worker rejects those collector types and skips audio discovery.

## Current Processing Model

```text
source
  -> discovery and domain safety
  -> URL, extension, MIME, and HTML filtering
  -> download and SHA-256 hashing
  -> PDF/text extraction and Unicode normalization
  -> language, quality, and topic analysis
  -> structured metadata export
  -> storage, manifest, and API registration
```

Raw files remain the source of truth. Processing changes metadata and database display names; it does not rewrite or delete raw storage objects.

## Structured Export

Text-bearing files and extracted web pages receive a `structured_document.v1` object. Its shape is designed for later search, NLP, review, and dataset creation:

```json
{
  "schema_version": "structured_document.v1",
  "id": "content-or-file-identity",
  "source": {
    "publisher": "source name",
    "url": "https://example.com/path",
    "domain": "example.com",
    "subdomain": "archive",
    "route": "/path",
    "file_path": "00_raw/web/source/run/document.pdf"
  },
  "document": {
    "title": "Document title",
    "document_type": "pdf",
    "language": "ckb",
    "dialect": "sorani",
    "script": "arabic",
    "direction": "rtl"
  },
  "text": {
    "raw_text": "Original extracted text",
    "converted_text": "Decoded text",
    "normalized_text": "NFC-normalized text",
    "primary_text": "Canonical text used by search and NLP",
    "primary_text_source": "normalized_text",
    "paragraphs": ["First paragraph", "Second paragraph"]
  },
  "conversion": {
    "encoding_type": "unicode_normalized",
    "conversion_confidence": 0.95,
    "normalization": "unicode_nfc"
  },
  "structure": {
    "paragraph_count": 2,
    "word_count": 20,
    "char_count": 140
  },
  "quality": {
    "text_quality": "verified",
    "conversion_verified": true,
    "language_verified": true,
    "structure_verified": true
  }
}
```

Confidence and verification values are evidence-based. The platform does not claim 100% language or conversion accuracy when the available evidence is uncertain.

## Dashboard Workflow

1. Create a source and configure a web or Telegram collector.
2. Run the collector and inspect pages, files, duplicates, errors, and manifests.
3. Open **Process** from the dashboard.
4. Run **Preview changes** first.
5. Review proposed names, duplicate records, and processing counts.
6. Run **Apply processing** when the preview is correct.

The Process section is restricted to Data Manager-level users. It applies deterministic canonical names, adds processing metadata, and marks repeated SHA-256 records as duplicates without deleting source lineage.

## Storage Layout

Typical local storage paths look like:

```text
storage/
  00_raw/
    web/{source}/{run}/
      pdf/digital/
      pdf/ocr/
      documents/
      ebooks/
      data/web_content/
      metadata.jsonl
      manifest.json
    telegram/{source}/{run}/
```

`pdf/ocr` currently means that the PDF is likely scanned, sparse, or unsuitable for native text extraction. It is not yet a generated OCR text layer. Actual OCR generation remains a separate future processing stage.

## Services

Docker runs three application services plus infrastructure:

- `web`: React/Vite dashboard served through Nginx
- `api`: Express, TypeScript, Prisma-backed API
- `scraper`: Python collection worker
- `postgres`: database
- `redis`: queue and progress state

Important directories:

```text
apps/web/                 Dashboard
services/api/             API and storage reconciliation
services/scraper/         Crawlers and processing pipeline
packages/database/        Prisma schema and database scripts
packages/shared-types/    Shared TypeScript types
storage/                  Local development storage
```

## Deployment

### Requirements

- Docker Desktop or Docker Engine with Compose
- A `.env` file based on `.env.example`
- Auth secrets of at least 32 characters
- `API_SERVICE_TOKEN` for scraper-to-API communication
- PostgreSQL and Redis values matching the Compose configuration

Local storage is the default and does not require R2 credentials. To use Cloudflare R2, set `STORAGE_PROVIDER=r2` and provide the configured account, bucket, access key, and secret key values.

### Start

```bash
docker compose up --build -d
docker compose ps
```

Open the dashboard at `http://localhost` unless your Nginx or host configuration uses another address.

The API entrypoint runs migrations and attempts development admin bootstrap. Change development credentials immediately before using the platform outside a local environment.

### Logs and shutdown

```bash
docker compose logs -f
docker compose logs -f api
docker compose logs -f scraper
docker compose restart
docker compose down
```

### Development Compose

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

### Update an Existing Docker Installation

From the repository directory on the other PC, run the update script after pulling the latest code:

```powershell
.\scripts\update-and-process.ps1 -AccessToken "YOUR_DATA_MANAGER_ACCESS_TOKEN"
```

The script pulls `main`, rebuilds and restarts Docker, waits for the API, and runs a **preview** of the existing-data processing pass. To apply the preview:

```powershell
.\scripts\update-and-process.ps1 -AccessToken "YOUR_DATA_MANAGER_ACCESS_TOKEN" -Apply
```

To update Docker without processing existing records:

```powershell
.\scripts\update-and-process.ps1 -SkipProcessing
```

The processing pass normalizes database display names, canonical filenames, processing metadata, and duplicate status. It does not delete or rewrite raw storage files. Use a Data Manager access token; do not place credentials in the script or commit them to the repository.

## Authentication and Security

- Use strong, unique access and refresh secrets.
- Do not expose development credentials on a shared network.
- Keep R2 credentials and Telegram account credentials out of collector configuration and frontend code.
- Use configured domain allowlists and URL patterns for each collector.
- Treat raw storage as sensitive source material and protect the host filesystem or bucket.
- File access and management routes should be used only through authenticated dashboard/API sessions.

## Testing

Run the scraper suite on Windows:

```powershell
Push-Location services/scraper
.\.venv\Scripts\python.exe -m pytest
Pop-Location
```

Run the JavaScript suites when workspace dependencies are installed correctly:

```bash
npm run test --workspace=services/api
npm run test:e2e --workspace=apps/web
npm run test
```

The scraper suite covers discovery, SSRF protection, URL normalization, PDF classification, storage manifests, Telegram behavior, and structured-document exports.

## Database Commands

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
npm run db:create-admin --workspace=packages/database
npm run db:create-service-account --workspace=packages/database
```

## Operational Notes

- Collection deduplication occurs before and after download: known URLs can be skipped, and identical content is caught by SHA-256.
- Web pages are rejected when they are empty, too short, repetitive, or clearly an error/login/consent page.
- `source_url`, `final_url`, route metadata, content fingerprints, and processing metadata should be retained for lineage.
- Do not treat a classifier confidence value as a human verification record. Review low-confidence language, OCR, and conversion results before publishing a dataset.
- Processing is intentionally repeatable and non-destructive.

## Known Limitations

- Scanned PDFs are classified as OCR candidates, but an OCR engine and generated searchable PDF/text output are not yet integrated.
- Language and dialect detection is heuristic and should expose confidence for review.
- R2 reconciliation and some API/frontend checks depend on the workspace package links being installed correctly.
- Existing raw files are not retroactively rewritten by the Process section; apply processing to update database metadata and display names.

## License and Contributions

Keep changes focused on the owning service, add regression tests for behavior changes, and run the scraper suite before submitting a change. Do not commit credentials, downloaded source corpora, local storage, `.venv`, or build output.
