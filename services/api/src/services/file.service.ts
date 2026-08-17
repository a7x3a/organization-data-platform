import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import { storageProvider } from './storage';
import { formatFileId } from '../utils/fileId';
import { canonicalFilename, categorizeFile } from '../utils/naming';
import type { RecordFileInput, ManualEntryInput, UpdateFileInput } from '../schemas/index';

// Prisma maps CollectedFile.fileSize to BigInt, which JSON.stringify (and
// therefore res.json) cannot serialize on its own. File sizes stay well
// under Number.MAX_SAFE_INTEGER given the configured upload limit, so a
// plain Number is safe for API responses.
function serializeFile<T extends { fileSize: bigint | null }>(
  file: T
): Omit<T, 'fileSize'> & { fileSize: number | null } {
  return { ...file, fileSize: file.fileSize === null ? null : Number(file.fileSize) };
}

export async function listFiles(query: {
  page?: string;
  pageSize?: string;
  collectionRunId?: string;
  sourceId?: string;
  status?: string;
  sha256?: string;
  sourceUrl?: string;
}) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const where: Record<string, unknown> = {};
  if (query.collectionRunId) where.collectionRunId = query.collectionRunId;
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;
  if (query.sourceUrl) where.sourceUrl = query.sourceUrl;
  if (query.sha256) where.sha256 = query.sha256;

  const [data, total] = await prisma.$transaction([
    prisma.collectedFile.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileId: true,
        collectionRunId: true,
        sourceId: true,
        sourceUrl: true,
        finalUrl: true,
        fileName: true,
        originalFilename: true,
        canonicalFilename: true,
        extension: true,
        mimeType: true,
        fileSize: true,
        sha256: true,
        r2Key: true,
        status: true,
        origin: true,
        metadata: true,
        uploadedByUserId: true,
        discoveredAt: true,
        downloadedAt: true,
        createdAt: true,
      },
    }),
    prisma.collectedFile.count({ where }),
  ]);

  return buildPaginatedResult(data.map(serializeFile), total, pagination);
}

export async function getFileById(id: string) {
  const file = await prisma.collectedFile.findUnique({
    where: { id },
    include: {
      collectionRun: { select: { id: true, runId: true, status: true } },
      source: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!file) throw new AppError(404, 'File not found', 'FILE_NOT_FOUND');
  return serializeFile(file);
}

// Called by the scraper worker to record a downloaded/duplicate/failed file.
// Sequence uses count()+1, same non-atomic convention as generateRunId() in
// run.service.ts — acceptable given today's single-worker concurrency model,
// but would need a real DB sequence if the scraper is ever scaled out.
export async function recordFile(input: RecordFileInput) {
  const sequence = (await prisma.collectedFile.count()) + 1;

  const file = await prisma.collectedFile.create({
    data: {
      fileId: formatFileId(sequence),
      collectionRunId: input.collectionRunId,
      sourceId: input.sourceId,
      sourceUrl: input.sourceUrl,
      finalUrl: input.finalUrl,
      fileName: input.fileName,
      extension: input.extension,
      mimeType: input.mimeType,
      fileSize: input.fileSize !== undefined ? BigInt(input.fileSize) : null,
      sha256: input.sha256,
      r2Key: input.r2Key,
      status: input.status,
      downloadedAt: input.status === 'UPLOADED' ? new Date() : null,
    },
  });

  return serializeFile(file);
}

// A human uploads a file directly through the UI (no scrape run involved).
// Mirrors the scraper's own pipeline: hash -> dedupe -> store -> record.
export async function createManualUpload(input: {
  sourceId: string;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string | null;
  uploadedByUserId: string;
  metadata?: Record<string, unknown>;
}) {
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new AppError(404, 'Source not found', 'SOURCE_NOT_FOUND');

  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

  const duplicate = await prisma.collectedFile.findFirst({ where: { sha256 } });

  const sequence = (await prisma.collectedFile.count()) + 1;
  const fileId = formatFileId(sequence);
  const extension = input.originalFilename.includes('.')
    ? input.originalFilename.slice(input.originalFilename.lastIndexOf('.'))
    : null;
  const canonical = canonicalFilename(input.originalFilename, fileId, extension);

  if (duplicate) {
    const file = await prisma.collectedFile.create({
      data: {
        fileId,
        sourceId: input.sourceId,
        fileName: input.originalFilename,
        originalFilename: input.originalFilename,
        canonicalFilename: canonical,
        extension,
        mimeType: input.mimeType,
        fileSize: BigInt(input.buffer.length),
        sha256,
        status: 'DUPLICATE',
        origin: 'MANUAL_UPLOAD',
        uploadedByUserId: input.uploadedByUserId,
        metadata: input.metadata as object | undefined,
      },
    });
    return serializeFile(file);
  }

  const category = categorizeFile(input.mimeType, extension);
  const r2Key = `00_raw/manual/${source.slug}/${category}/${canonical}`;
  await storageProvider.upload(r2Key, input.buffer, input.mimeType || 'application/octet-stream');

  const file = await prisma.collectedFile.create({
    data: {
      fileId,
      sourceId: input.sourceId,
      fileName: input.originalFilename,
      originalFilename: input.originalFilename,
      canonicalFilename: canonical,
      extension,
      mimeType: input.mimeType,
      fileSize: BigInt(input.buffer.length),
      sha256,
      r2Key,
      status: 'UPLOADED',
      origin: 'MANUAL_UPLOAD',
      uploadedByUserId: input.uploadedByUserId,
      downloadedAt: new Date(),
      metadata: input.metadata as object | undefined,
    },
  });

  return serializeFile(file);
}

// Catalogs a document's metadata without attaching a file yet (e.g. a known
// item to be filled in later). Never AI-inferred — only what the user supplies.
export async function createManualEntry(input: ManualEntryInput & { uploadedByUserId: string }) {
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new AppError(404, 'Source not found', 'SOURCE_NOT_FOUND');

  const sequence = (await prisma.collectedFile.count()) + 1;
  const fileId = formatFileId(sequence);

  const file = await prisma.collectedFile.create({
    data: {
      fileId,
      sourceId: input.sourceId,
      fileName: input.fileName,
      originalFilename: input.fileName,
      mimeType: input.mimeType,
      status: 'DISCOVERED',
      origin: 'MANUAL_ENTRY',
      uploadedByUserId: input.uploadedByUserId,
      metadata: input.metadata as object | undefined,
    },
  });

  return serializeFile(file);
}

export async function getFileDownloadUrl(id: string) {
  const file = await getFileById(id);

  if (!file.r2Key) {
    throw new AppError(404, 'File has no R2 key — not yet uploaded', 'FILE_NOT_UPLOADED');
  }

  const { url, expiresAt } = await storageProvider.getSignedUrl(file.r2Key);
  return { url, expiresAt };
}

// Metadata-only edit — fileName/metadata are the only fields a user can
// change after the fact (see updateFileSchema). sha256/r2Key/status/fileSize
// stay exactly as the collector recorded them; editing those would break the
// lineage guarantee ("every raw file must be traceable back to its source
// run") that the rest of this platform relies on.
export async function updateFile(id: string, input: UpdateFileInput) {
  await getFileById(id); // throws 404 if not found

  const file = await prisma.collectedFile.update({
    where: { id },
    data: {
      ...(input.fileName !== undefined && { fileName: input.fileName }),
      ...(input.metadata !== undefined && { metadata: input.metadata as object }),
    },
  });
  return serializeFile(file);
}

// Hard delete — removes the database record AND the underlying stored
// object (R2/local), for a file of ANY origin including scraped ones. This
// is a deliberate, explicit exception to "00_raw is immutable": unlike
// Source/Collector deletion (which refuse to delete when dependent data
// exists), the platform has no dependents *below* a CollectedFile to
// protect, so there's nothing to restrict against — but it does mean a
// collection run's raw output can now be permanently destroyed after the
// fact, which every other deletion path in this codebase was built to avoid.
export async function deleteFile(id: string) {
  const file = await getFileById(id); // throws 404 if not found

  if (file.r2Key) {
    try {
      await storageProvider.delete(file.r2Key);
    } catch (err) {
      // A storage-side failure (object already gone, transient R2 error)
      // should not leave an orphaned DB record that the UI can never clear —
      // log and continue, same "don't let a secondary failure block the
      // primary operation" pattern the scraper's own _finalize() uses for
      // manifest/metadata uploads.
      logger.error({ err, fileId: id, r2Key: file.r2Key }, 'file_storage_delete_failed');
    }
  }

  await prisma.collectedFile.delete({ where: { id } });
}

export async function syncStorageDirectories() {
  const files = await prisma.collectedFile.findMany({
    where: { r2Key: { not: null } },
    select: { id: true, r2Key: true },
  });

  let syncedCount = 0;
  let prunedCount = 0;

  for (const f of files) {
    if (!f.r2Key) continue;
    const exists = await storageProvider.exists(f.r2Key);
    if (exists) {
      syncedCount++;
    } else {
      // File no longer exists in storage (offline disk or R2 cloud) — remove orphaned DB record
      try {
        await prisma.collectedFile.delete({ where: { id: f.id } });
        prunedCount++;
      } catch {
        // Ignore if already deleted
      }
    }
  }

  // Clean up any empty collection runs that have 0 files left
  try {
    const activeRunFiles = await prisma.collectedFile.findMany({
      where: { collectionRunId: { not: null } },
      select: { collectionRunId: true },
      distinct: ['collectionRunId'],
    });
    const activeRunIds = new Set(activeRunFiles.map((f) => f.collectionRunId).filter((id): id is string => Boolean(id)));

    const allRuns = await prisma.collectionRun.findMany({ select: { id: true } });
    const emptyRunIds = allRuns.map((r) => r.id).filter((id) => !activeRunIds.has(id));

    if (emptyRunIds.length > 0) {
      await prisma.collectionRun.deleteMany({
        where: { id: { in: emptyRunIds } },
      });
    }
  } catch {
    // Ignore cleanup errors
  }

  return {
    provider: env.STORAGE_PROVIDER,
    totalChecked: files.length,
    syncedCount,
    missingCount: prunedCount,
    prunedOrphansCount: prunedCount,
    timestamp: new Date().toISOString(),
  };
}
