import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

// ─── User management ────────────────────────────────────────────

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9_-]+$/i, 'Username must be letters, numbers, underscores, and hyphens only'),
  password: z.string().min(8),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  roles: z
    .array(
      z.enum([
        'ADMIN',
        'DATA_MANAGER',
        'COLLECTOR',
        'REVIEWER',
        'ML_ENGINEER',
        'RESEARCHER',
        'SERVICE_ACCOUNT',
      ])
    )
    .min(1, 'At least one role is required'),
});

// ─── Pagination ───────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// zod strips unrecognized keys by default (not an error), and `validate()`
// replaces req.query with the parsed result — so any list route validated
// against bare paginationSchema silently drops every filter param it's
// given. listFiles/listRuns/listCollectors each support extra filters
// (sourceId, status, sha256, ...); the schema each route validates against
// must extend paginationSchema with those same fields or they never survive
// past the middleware. This is what broke duplicate detection: the scraper's
// GET /api/files?sha256=X was silently becoming GET /api/files (unfiltered),
// so total > 0 as soon as ANY file existed anywhere — every newly scraped
// file looked like a duplicate of something, and nothing new ever got saved.
export const listCollectorsQuerySchema = paginationSchema.extend({
  sourceId: z.string().optional(),
});

export const listRunsQuerySchema = paginationSchema.extend({
  collectorId: z.string().optional(),
  sourceId: z.string().optional(),
  status: z.string().optional(),
});

export const listFilesQuerySchema = paginationSchema.extend({
  collectionRunId: z.string().optional(),
  sourceId: z.string().optional(),
  status: z.string().optional(),
  sha256: z.string().optional(),
  sourceUrl: z.string().optional(),
});

// ─── Source ───────────────────────────────────────────────────

export const createSourceSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  baseUrl: z.string().url(),
  description: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().default(true),
  robotsPolicy: z.enum(['RESPECT', 'IGNORE']).default('RESPECT'),
});

export const updateSourceSchema = createSourceSchema.partial();

// ─── Collector Configuration ──────────────────────────────────

const collectorConfigSchema = z.object({
  startUrls: z.array(z.string().url()).min(1),
  allowedDomains: z.array(z.string()).default([]),
  allowedUrlPatterns: z.array(z.string()).default([]),
  excludedUrlPatterns: z.array(z.string()).default([]),
  allowedExtensions: z.array(z.string()).default([]),
  allowedMimeTypes: z.array(z.string()).default([]),
  maxDepth: z.number().int().min(1).max(20).default(5),
  maxPages: z.number().int().min(1).max(100000).default(10000),
  maxFiles: z.number().int().min(1).max(100000).default(10000),
  requestDelayMs: z.number().int().min(0).max(60000).default(1000),
  concurrency: z.number().int().min(1).max(32).default(4),
  requestTimeoutSeconds: z.number().int().min(5).max(300).default(30),
  maxRetries: z.number().int().min(0).max(10).default(3),
  useBrowser: z.boolean().default(false),
  robotsEnabled: z.boolean().default(true),
});

// ─── Collector ────────────────────────────────────────────────

export const createCollectorSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(['WEB', 'TELEGRAM', 'API', 'APP', 'MANUAL', 'EXTERNAL']).default('WEB'),
  version: z.string().default('1.0.0'),
  enabled: z.boolean().default(true),
  schedule: z.string().nullable().optional(),
  configuration: collectorConfigSchema,
});

export const updateCollectorSchema = createCollectorSchema.partial().omit({ sourceId: true });

// ─── ID param ────────────────────────────────────────────────

export const idParamSchema = z.object({
  id: z.string().min(1),
});

// ─── Collection Run status updates (scraper worker callback) ──

export const updateRunStatusSchema = z.object({
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED']),
  // { offset: true } — Python's datetime.now(timezone.utc).isoformat() emits
  // a "+00:00" suffix, not "Z"; Zod rejects offset suffixes by default.
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  manifestR2Key: z.string().optional(),
  filesFound: z.number().int().min(0).optional(),
  filesDownloaded: z.number().int().min(0).optional(),
  filesSkipped: z.number().int().min(0).optional(),
  filesDuplicate: z.number().int().min(0).optional(),
  filesFailed: z.number().int().min(0).optional(),
  pagesCrawled: z.number().int().min(0).optional(),
});

// ─── Collected File reporting (scraper worker callback) ───────

export const recordFileSchema = z.object({
  collectionRunId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().min(1),
  finalUrl: z.string().optional(),
  fileName: z.string().min(1),
  extension: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  fileSize: z.number().int().min(0).optional(),
  sha256: z.string().optional(),
  r2Key: z.string().optional(),
  status: z.enum(['DISCOVERED', 'DOWNLOADING', 'UPLOADED', 'DUPLICATE', 'SKIPPED', 'FAILED']),
});

// ─── Collection Error reporting (scraper worker callback) ─────

export const recordErrorSchema = z.object({
  url: z.string().optional(),
  errorCode: z.enum([
    'NETWORK_ERROR',
    'TIMEOUT',
    'HTTP_ERROR',
    'RATE_LIMITED',
    'FORBIDDEN',
    'NOT_FOUND',
    'INVALID_CONTENT',
    'FILE_TOO_LARGE',
    'UNSUPPORTED_TYPE',
    'HASH_ERROR',
    'R2_UPLOAD_ERROR',
    'DATABASE_ERROR',
    'CANCELLED',
    'UNKNOWN',
  ]),
  message: z.string().min(1),
});

export type UpdateRunStatusInput = z.infer<typeof updateRunStatusSchema>;
export type RecordFileInput = z.infer<typeof recordFileSchema>;
export type RecordErrorInput = z.infer<typeof recordErrorSchema>;

// ─── Manual upload / manual document entry ─────────────────────

export const manualUploadBodySchema = z.object({
  sourceId: z.string().min(1),
  metadata: z.string().optional(), // JSON string from multipart form field
});

export const manualEntrySchema = z.object({
  sourceId: z.string().min(1),
  fileName: z.string().min(1).max(500),
  mimeType: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ManualEntryInput = z.infer<typeof manualEntrySchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type CreateCollectorInput = z.infer<typeof createCollectorSchema>;
export type UpdateCollectorInput = z.infer<typeof updateCollectorSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
