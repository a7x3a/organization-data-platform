// =============================================================
// @odp/shared-types — Shared TypeScript types for the
// Organization Data Platform Web Collection System.
// Consumed by both apps/web and services/api.
// =============================================================

// ─── Enums ───────────────────────────────────────────────────

export enum RunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCEL_REQUESTED = 'CANCEL_REQUESTED',
  CANCELLED = 'CANCELLED',
}

export enum FileStatus {
  DISCOVERED = 'DISCOVERED',
  DOWNLOADING = 'DOWNLOADING',
  UPLOADED = 'UPLOADED',
  DUPLICATE = 'DUPLICATE',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export enum CollectorType {
  WEB = 'WEB',
  TELEGRAM = 'TELEGRAM',
  MEDIA = 'MEDIA',
  API = 'API',
  APP = 'APP',
  MANUAL = 'MANUAL',
  EXTERNAL = 'EXTERNAL',
}

export enum RobotsPolicy {
  RESPECT = 'RESPECT',
  IGNORE = 'IGNORE',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  DATA_MANAGER = 'DATA_MANAGER',
  COLLECTOR = 'COLLECTOR',
  REVIEWER = 'REVIEWER',
  ML_ENGINEER = 'ML_ENGINEER',
  RESEARCHER = 'RESEARCHER',
  SERVICE_ACCOUNT = 'SERVICE_ACCOUNT',
}

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  HTTP_ERROR = 'HTTP_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_CONTENT = 'INVALID_CONTENT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
  HASH_ERROR = 'HASH_ERROR',
  R2_UPLOAD_ERROR = 'R2_UPLOAD_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CANCELLED = 'CANCELLED',
  UNKNOWN = 'UNKNOWN',
}

// ─── Core Entities ───────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  email: string | null;
  name: string;
  roles: UserRole[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  description: string | null;
  enabled: boolean;
  robotsPolicy: RobotsPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface WebCollectorConfiguration {
  startUrls: string[];
  allowedDomains: string[];
  allowedUrlPatterns: string[];
  excludedUrlPatterns: string[];
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxDepth: number;
  maxPages: number;
  maxFiles: number;
  requestDelayMs: number;
  concurrency: number;
  requestTimeoutSeconds: number;
  maxRetries: number;
  useBrowser: boolean;
  robotsEnabled: boolean;
}

// Telegram collectors never carry api_id/api_hash/session here — those are
// account-level credentials that live only in the scraper worker's own
// environment, never per-collector and never sent to this frontend.
export interface TelegramCollectorConfiguration {
  channels: string[];
  messageLimit: number;
  sinceDate?: string;
  downloadMedia: boolean;
  includeMediaTypes?: Array<'photo' | 'video' | 'audio' | 'document'>;
  allowedExtensions?: string[];
  saveMessageJson?: boolean;
}

export interface MediaCollectorConfiguration {
  mediaUrl?: string;
  startUrls?: string[];
  localPath?: string;
  audioChunkSeconds?: number;
  geminiModel?: string;
}

export type CollectorConfiguration =
  | WebCollectorConfiguration
  | TelegramCollectorConfiguration
  | MediaCollectorConfiguration;

export interface Collector {
  id: string;
  sourceId: string;
  source?: Source;
  name: string;
  type: CollectorType;
  version: string;
  enabled: boolean;
  schedule: string | null;
  configuration: CollectorConfiguration;
  createdAt: string;
  updatedAt: string;
}

// `type` and `configuration` are separate fields with no structural link
// TypeScript can infer on its own — these narrow `configuration` to the
// right shape after checking `type`, instead of every consumer needing its
// own unsafe `as WebCollectorConfiguration` cast.
export function isWebCollector(
  collector: Collector
): collector is Collector & { configuration: WebCollectorConfiguration } {
  return collector.type === CollectorType.WEB;
}

export function isTelegramCollector(
  collector: Collector
): collector is Collector & { configuration: TelegramCollectorConfiguration } {
  return collector.type === CollectorType.TELEGRAM;
}

export function isMediaCollector(
  collector: Collector
): collector is Collector & { configuration: MediaCollectorConfiguration } {
  return collector.type === CollectorType.MEDIA;
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface UserTelegramSession {
  id: string;
  userId: string;
  phoneNumber?: string | null;
  sessionString?: string;
  apiId?: number | null;
  apiHash?: string | null;
  isVerified: boolean;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRun {
  id: string;
  collectorId: string;
  collector?: Pick<Collector, 'id' | 'name' | 'type'>;
  sourceId: string;
  source?: Pick<Source, 'id' | 'name' | 'slug'>;
  runId: string;
  status: RunStatus;
  approvalStatus: ApprovalStatus;
  approvedById?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  approvedBy?: { id: string; name: string; username: string } | null;
  createdById?: string | null;
  createdBy?: { id: string; name: string; username: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  filesFound: number;
  filesDownloaded: number;
  filesSkipped: number;
  filesDuplicate: number;
  filesFailed: number;
  pagesCrawled: number;
  errorCount: number;
  collectorVersion: string;
  manifestR2Key: string | null;
  createdAt: string;
  errors?: CollectionError[];
}

export enum FileOrigin {
  SCRAPED = 'SCRAPED',
  MANUAL_UPLOAD = 'MANUAL_UPLOAD',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
}

export interface CollectedFile {
  id: string;
  fileId: string;
  collectionRunId: string | null;
  sourceId: string;
  sourceUrl: string | null;
  finalUrl: string | null;
  fileName: string;
  originalFilename: string | null;
  canonicalFilename: string | null;
  extension: string | null;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  r2Key: string | null;
  status: FileStatus;
  origin: FileOrigin;
  approvalStatus: ApprovalStatus;
  approvedById?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  approvedBy?: { id: string; name: string; username: string } | null;
  metadata: Record<string, unknown> | null;
  uploadedByUserId: string | null;
  etag: string | null;
  lastModified: string | null;
  discoveredAt: string;
  downloadedAt: string | null;
  createdAt: string;
}

export interface CollectionError {
  id: string;
  collectionRunId: string;
  collectedFileId: string | null;
  errorCode: ErrorCode;
  message: string;
  url: string | null;
  retryCount: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── API Shapes ──────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
}

// ─── Auth ────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  name: string;
  email?: string;
  roles: UserRole[];
}

export interface UpdateUserRequest {
  name?: string;
  email?: string | null;
  password?: string;
  roles?: UserRole[];
  isActive?: boolean;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

// ─── Request/Response helpers ─────────────────────────────────

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export interface RunStartResponse {
  runId: string;
  collectionRunId: string;
  status: RunStatus;
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────

export interface DashboardStats {
  totalSources: number;
  activeCollectors: number;
  runningRuns: number;
  totalFilesCollected: number;
  totalDuplicates: number;
  totalFailedFiles: number;
  recentRuns: CollectionRun[];
}

// ─── Metadata JSONL record (mirrors scraper output) ───────────

export interface FileMetadataRecord {
  file_id: string;
  source: string;
  source_name: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  date_downloaded: string;
  source_url: string;
  final_url: string;
  r2_key: string;
}

// ─── Manifest (mirrors scraper output) ───────────────────────

export interface RunManifest {
  run_id: string;
  source: string;
  source_name: string;
  started_at: string;
  completed_at: string;
  files_found: number;
  files_downloaded: number;
  files_skipped: number;
  files_duplicate: number;
  files_failed: number;
  pages_crawled: number;
  collector_version: string;
  status: string;
}
