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

export const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8).optional(),
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
    .min(1, 'At least one role is required')
    .optional(),
  isActive: z.boolean().optional(),
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
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export const approveRejectRunSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const approveRejectFileSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const bulkFileApprovalSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(2000).optional(),
});

export const runFilesApprovalSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const listFilesQuerySchema = paginationSchema.extend({
  collectionRunId: z.string().optional(),
  sourceId: z.string().optional(),
  status: z.string().optional(),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
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
    .regex(/^[a-z0-9-_]+$/, 'Slug must be lowercase letters, numbers, hyphens, and underscores only'),
  baseUrl: z.string().url(),
  description: z.string().max(2000).optional().nullable(),
  enabled: z.boolean().default(true),
  robotsPolicy: z.enum(['RESPECT', 'IGNORE']).default('RESPECT'),
});

export const updateSourceSchema = createSourceSchema.partial();

// ─── Collector Configuration ──────────────────────────────────

const webCollectorConfigSchema = z.object({
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

// Telegram collectors never carry api_id/api_hash/session here — those are
// account-level credentials configured once via the scraper worker's own
// environment (TELEGRAM_API_ID/TELEGRAM_API_HASH/TELEGRAM_SESSION_STRING),
// never per-collector and never sent to the frontend, same as R2 credentials.
const telegramCollectorConfigSchema = z.object({
  channels: z.array(z.string().min(1)).min(1),
  messageLimit: z.number().int().min(1).max(100000).default(500),
  sinceDate: z.string().datetime({ offset: true }).optional(),
  downloadMedia: z.boolean().default(true),
  includeMediaTypes: z.array(z.enum(['photo', 'video', 'audio', 'document'])).default([]),
  allowedExtensions: z.array(z.string()).default([]),
  saveMessageJson: z.boolean().default(false),
});

const mediaCollectorConfigSchema = z.object({
  mediaUrl: z.string().optional(),
  startUrls: z.array(z.string()).optional(),
  localPath: z.string().optional(),
  audioChunkSeconds: z.number().int().min(1).max(300).default(30),
  geminiModel: z.string().default('gemini-2.0-flash'),
});

// ─── Collector ────────────────────────────────────────────────

const baseCollectorSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(['WEB', 'TELEGRAM', 'MEDIA', 'API', 'APP', 'MANUAL', 'EXTERNAL']).default('WEB'),
  version: z.string().default('1.0.0'),
  enabled: z.boolean().default(true),
  schedule: z.string().nullable().optional(),
  configuration: z.union([webCollectorConfigSchema, telegramCollectorConfigSchema, mediaCollectorConfigSchema]),
});

function refineConfigurationMatchesType(
  data: { type?: string; configuration: unknown },
  ctx: z.RefinementCtx
) {
  let result;
  if (data.type === 'TELEGRAM') {
    result = telegramCollectorConfigSchema.safeParse(data.configuration);
  } else if (data.type === 'MEDIA') {
    result = mediaCollectorConfigSchema.safeParse(data.configuration);
  } else {
    result = webCollectorConfigSchema.safeParse(data.configuration);
  }

  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        ...issue,
        path: ['configuration', ...issue.path],
      });
    }
  }
}

export const createCollectorSchema = baseCollectorSchema.superRefine(refineConfigurationMatchesType);

export const updateCollectorSchema = baseCollectorSchema
  .partial()
  .omit({ sourceId: true })
  .superRefine((data, ctx) => {
    // On update, `type` may be omitted (unchanged) and `configuration` may
    // be omitted too (not being changed this call) — only cross-validate
    // when both are actually present in the request body.
    if (data.type && data.configuration) {
      refineConfigurationMatchesType(data as { type: string; configuration: unknown }, ctx);
    }
  });

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

// User-editable file fields only — deliberately excludes sha256/r2Key/status/
// fileSize/etc., which are collection-integrity facts recorded by the
// scraper, not metadata a user should be able to edit after the fact.
export const updateFileSchema = z.object({
  fileName: z.string().min(1).max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
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
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ManualEntryInput = z.infer<typeof manualEntrySchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type UpdateSourceInput = z.infer<typeof updateSourceSchema>;
export type CreateCollectorInput = z.infer<typeof createCollectorSchema>;
export type UpdateCollectorInput = z.infer<typeof updateCollectorSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
