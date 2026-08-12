# Graph Report - .  (2026-08-12)

## Corpus Check
- Corpus is ~22,730 words - fits in a single context window. You may not need a graph.

## Summary
- 693 nodes · 1038 edges · 32 communities (28 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.73)
- Token cost: 8,685 input · 1,788 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Config & Connections|API Config & Connections]]
- [[_COMMUNITY_Web API Client Layer|Web API Client Layer]]
- [[_COMMUNITY_Scraper Collection Job|Scraper Collection Job]]
- [[_COMMUNITY_i18n AuthLogin Strings|i18n Auth/Login Strings]]
- [[_COMMUNITY_Auth & RBAC Middleware|Auth & RBAC Middleware]]
- [[_COMMUNITY_FilesRuns UI Hooks & Components|Files/Runs UI Hooks & Components]]
- [[_COMMUNITY_API Service Dependencies|API Service Dependencies]]
- [[_COMMUNITY_i18n Collector Strings|i18n Collector Strings]]
- [[_COMMUNITY_i18n Run Stats Strings|i18n Run Stats Strings]]
- [[_COMMUNITY_Web App Utilities & Deps|Web App Utilities & Deps]]
- [[_COMMUNITY_Web App Shell & Layouts|Web App Shell & Layouts]]
- [[_COMMUNITY_Scraper Downloader|Scraper Downloader]]
- [[_COMMUNITY_API tsconfig|API tsconfig]]
- [[_COMMUNITY_Web tsconfig|Web tsconfig]]
- [[_COMMUNITY_Web App Dev Dependencies|Web App Dev Dependencies]]
- [[_COMMUNITY_Root package.json|Root package.json]]
- [[_COMMUNITY_Database Package (Prisma)|Database Package (Prisma)]]
- [[_COMMUNITY_Scraper Manifest Writer|Scraper Manifest Writer]]
- [[_COMMUNITY_Shared Types Package|Shared Types Package]]
- [[_COMMUNITY_R2 Storage Client|R2 Storage Client]]
- [[_COMMUNITY_Shared Types tsconfig|Shared Types tsconfig]]
- [[_COMMUNITY_Web tsconfig (Node)|Web tsconfig (Node)]]
- [[_COMMUNITY_Scraper Worker Entry Point|Scraper Worker Entry Point]]
- [[_COMMUNITY_Scraper SettingsConfig|Scraper Settings/Config]]
- [[_COMMUNITY_Prod Architecture (APIWeb)|Prod Architecture (API/Web)]]
- [[_COMMUNITY_Dev Architecture (Docker)|Dev Architecture (Docker)]]
- [[_COMMUNITY_Prod Scraper Stack|Prod Scraper Stack]]
- [[_COMMUNITY_Immutable Zones  R2 Design|Immutable Zones / R2 Design]]
- [[_COMMUNITY_Prod PostgreSQL|Prod PostgreSQL]]
- [[_COMMUNITY_Prod Redis|Prod Redis]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `CollectionJob` - 18 edges
3. `compilerOptions` - 17 edges
4. `fields` - 17 edges
5. `common` - 17 edges
6. `fields` - 14 edges
7. `ManifestWriter` - 11 edges
8. `useAuth()` - 9 edges
9. `translation` - 9 edges
10. `sources` - 9 edges

## Surprising Connections (you probably didn't know these)
- `System Architecture` --conceptually_related_to--> `API Service (Prod)`  [INFERRED]
  README.md → docker-compose.yml
- `Scraper Service (Prod)` --implements--> `Scrapy`  [INFERRED]
  docker-compose.yml → services/scraper/requirements.txt
- `Scraper Service (Prod)` --implements--> `Playwright`  [INFERRED]
  docker-compose.yml → services/scraper/requirements.txt
- `Web Entry Point` --implements--> `Web App (Prod)`  [INFERRED]
  apps/web/index.html → docker-compose.yml
- `process_job()` --calls--> `CollectionJob`  [INFERRED]
  services/scraper/app/main.py → services/scraper/app/jobs/collection_job.py

## Communities (32 total, 4 thin omitted)

### Community 0 - "API Config & Connections"
Cohesion: 0.07
Nodes (42): Env, envSchema, connectDatabase(), disconnectDatabase(), globalForPrisma, connectRedis(), disconnectRedis(), redis (+34 more)

### Community 1 - "Web API Client Layer"
Cohesion: 0.06
Nodes (44): authApi, apiClient, failedQueue, token, collectorsApi, runsApi, dashboardApi, sourcesApi (+36 more)

### Community 2 - "Scraper Collection Job"
Cohesion: 0.05
Nodes (31): CollectionJob, Collection Job — orchestrates the full collection pipeline for one run.  Pipelin, Download, hash, deduplicate, upload one file., Upload metadata.jsonl and manifest.json, then update run status., Callback to API to update run status., Check if the run has been marked for cancellation., Ask the API if this SHA-256 already exists., Create a CollectedFile record via API and return its file_id. (+23 more)

### Community 3 - "i18n Auth/Login Strings"
Cohesion: 0.04
Nodes (45): email, login, loginButton, loginError, password, platformSubtitle, platformTitle, actions (+37 more)

### Community 4 - "Auth & RBAC Middleware"
Cohesion: 0.08
Nodes (36): JwtPayload, Request, requireAuth(), requireAdmin, requireCollector, requireDataManager, Target, validate() (+28 more)

### Community 5 - "Files/Runs UI Hooks & Components"
Cohesion: 0.11
Nodes (30): filesApi, Column, DataTable(), DataTableProps, FileStatusBadge(), FileStatusBadgeProps, RunStatusBadge(), RunStatusBadgeProps (+22 more)

### Community 6 - "API Service Dependencies"
Cohesion: 0.05
Nodes (39): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, bcryptjs, bullmq, compression, cookie-parser, cors (+31 more)

### Community 7 - "i18n Collector Strings"
Cohesion: 0.05
Nodes (39): create, disable, edit, enable, fields, run, subtitle, title (+31 more)

### Community 8 - "i18n Run Stats Strings"
Cohesion: 0.06
Nodes (36): collector, completedAt, duration, filesDownloaded, filesDuplicate, filesFailed, filesFound, filesSkipped (+28 more)

### Community 9 - "Web App Utilities & Deps"
Cohesion: 0.07
Nodes (30): cn(), dependencies, axios, class-variance-authority, clsx, date-fns, i18next, lucide-react (+22 more)

### Community 10 - "Web App Shell & Layouts"
Cohesion: 0.13
Nodes (15): ErrorBoundary, Props, State, AuthContext, AuthContextValue, AuthProvider(), useAuth(), AppLayout() (+7 more)

### Community 11 - "Scraper Downloader"
Cohesion: 0.11
Nodes (22): detect_mime(), download_file(), DownloadError, DownloadResult, extract_filename(), FileTooLargeError, InvalidContentError, Streaming downloader with MIME detection, size enforcement, and SHA-256.  Never (+14 more)

### Community 12 - "API tsconfig"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+14 more)

### Community 13 - "Web tsconfig"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleResolution (+13 more)

### Community 14 - "Web App Dev Dependencies"
Cohesion: 0.10
Nodes (20): devDependencies, autoprefixer, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, typescript (+12 more)

### Community 15 - "Root package.json"
Cohesion: 0.11
Nodes (17): description, devDependencies, typescript, engines, node, npm, name, private (+9 more)

### Community 16 - "Database Package (Prisma)"
Cohesion: 0.14
Nodes (13): dependencies, @prisma/client, devDependencies, prisma, name, private, scripts, prisma:generate (+5 more)

### Community 18 - "Shared Types Package"
Cohesion: 0.20
Nodes (9): devDependencies, typescript, main, name, private, scripts, typecheck, types (+1 more)

### Community 19 - "R2 Storage Client"
Cohesion: 0.20
Nodes (5): R2Client, Cloudflare R2 upload client using boto3.  Uses multipart upload for large files, Upload a file from disk to R2 using multipart for large files.         Raises on, Upload a small in-memory object (metadata.jsonl, manifest.json)., Check if an object exists without downloading it.

### Community 20 - "Shared Types tsconfig"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, module, moduleResolution, noEmit, strict, target, include

### Community 21 - "Web tsconfig (Node)"
Cohesion: 0.22
Nodes (8): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, strict, include

### Community 22 - "Scraper Worker Entry Point"
Cohesion: 0.29
Nodes (6): consume_jobs(), main(), process_job(), Scraper Worker Entry Point.  Listens for BullMQ jobs from Redis and dispatches t, Process a single BullMQ job., Simple BullMQ-compatible job consumer using Redis BLPOP.      BullMQ stores jobs

### Community 23 - "Scraper Settings/Config"
Cohesion: 0.29
Nodes (4): BaseSettings, Config, Scraper Worker Configuration All settings come from environment variables (never, Settings

### Community 24 - "Prod Architecture (API/Web)"
Cohesion: 0.50
Nodes (4): API Service (Prod), Web App (Prod), System Architecture, Web Entry Point

### Community 25 - "Dev Architecture (Docker)"
Cohesion: 0.67
Nodes (4): API Service (Dev), PostgreSQL (Dev), Redis (Dev), Scraper Service (Dev)

### Community 26 - "Prod Scraper Stack"
Cohesion: 0.67
Nodes (3): Scraper Service (Prod), Playwright, Scrapy

## Knowledge Gaps
- **318 isolated node(s):** `name`, `version`, `private`, `description`, `workspaces` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `translation` connect `i18n Auth/Login Strings` to `i18n Run Stats Strings`, `i18n Collector Strings`?**
  _High betweenness centrality (0.170) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Web App Utilities & Deps` to `Web App Dev Dependencies`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `cn()` connect `Web App Utilities & Deps` to `Files/Runs UI Hooks & Components`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `CollectionJob` (e.g. with `DownloadError` and `FileTooLargeError`) actually correct?**
  _`CollectionJob` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _358 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Config & Connections` be split into smaller, more focused modules?**
  _Cohesion score 0.06923076923076923 - nodes in this community are weakly interconnected._
- **Should `Web API Client Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.060655737704918035 - nodes in this community are weakly interconnected._