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
  approvalStatus?: string;
  sha256?: string;
  sourceUrl?: string;
}) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const where: Record<string, unknown> = {};
  if (query.collectionRunId) where.collectionRunId = query.collectionRunId;
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;
  if (query.approvalStatus) where.approvalStatus = query.approvalStatus;
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
        approvalStatus: true,
        approvedById: true,
        approvedAt: true,
        approvalNotes: true,
        approvedBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
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
      approvedBy: { select: { id: true, name: true, username: true } },
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
  const file = await prisma.collectedFile.findUnique({
    where: { id },
    include: { collectionRun: { include: { source: true } } },
  });
  if (!file) throw new AppError(404, 'File not found', 'FILE_NOT_FOUND');

  if (file.r2Key) {
    try {
      await storageProvider.delete(file.r2Key);
    } catch (err) {
      logger.error({ err, fileId: id, r2Key: file.r2Key }, 'file_storage_delete_failed');
    }
  }

  await prisma.collectedFile.delete({ where: { id } });

  // If this file belonged to a collection run, update the run's metadata.jsonl & manifest.json in storage
  if (file.collectionRun) {
    const run = file.collectionRun;
    const runFolderKey = run.manifestR2Key
      ? run.manifestR2Key.substring(0, run.manifestR2Key.lastIndexOf('/'))
      : run.source
      ? `00_raw/web/${run.source.slug}/${run.runId}`
      : null;

    if (runFolderKey) {
      try {
        // 1. Update root metadata.jsonl
        const metaKey = `${runFolderKey}/metadata.jsonl`;
        const metaBuf = await storageProvider.getBuffer(metaKey);
        if (metaBuf) {
          const lines = metaBuf.toString('utf-8').split('\n').filter((l) => l.trim().length > 0);
          const updatedLines = lines.filter((l) => {
            try {
              const obj = JSON.parse(l);
              if (obj.sha256 && file.sha256 && obj.sha256.toLowerCase() === file.sha256.toLowerCase()) return false;
              if (obj.file_id && file.fileId && obj.file_id === file.fileId) return false;
              if (obj.file_name && file.fileName && obj.file_name === file.fileName) return false;
              return true;
            } catch {
              return true;
            }
          });
          const newContent = updatedLines.length > 0 ? updatedLines.join('\n') + '\n' : '';
          await storageProvider.upload(metaKey, Buffer.from(newContent, 'utf-8'), 'application/jsonl');
          logger.info({ metaKey }, 'metadata_jsonl_updated_after_file_deletion');
        }

        // 2. Update category metadata.jsonl (if present)
        if (file.r2Key) {
          const catDir = file.r2Key.substring(0, file.r2Key.lastIndexOf('/'));
          if (catDir && catDir !== runFolderKey) {
            const catMetaKey = `${catDir}/metadata.jsonl`;
            const catMetaBuf = await storageProvider.getBuffer(catMetaKey);
            if (catMetaBuf) {
              const catLines = catMetaBuf.toString('utf-8').split('\n').filter((l) => l.trim().length > 0);
              const updatedCatLines = catLines.filter((l) => {
                try {
                  const obj = JSON.parse(l);
                  if (obj.sha256 && file.sha256 && obj.sha256.toLowerCase() === file.sha256.toLowerCase()) return false;
                  if (obj.file_id && file.fileId && obj.file_id === file.fileId) return false;
                  if (obj.file_name && file.fileName && obj.file_name === file.fileName) return false;
                  return true;
                } catch {
                  return true;
                }
              });
              const newCatContent = updatedCatLines.length > 0 ? updatedCatLines.join('\n') + '\n' : '';
              await storageProvider.upload(catMetaKey, Buffer.from(newCatContent, 'utf-8'), 'application/jsonl');
            }
          }
        }

        // 3. Update manifest.json stats
        const manifestKey = `${runFolderKey}/manifest.json`;
        const manifestBuf = await storageProvider.getBuffer(manifestKey);
        if (manifestBuf) {
          try {
            const manifest = JSON.parse(manifestBuf.toString('utf-8'));
            if (manifest.stats) {
              if (manifest.stats.files_downloaded > 0) manifest.stats.files_downloaded -= 1;
              if (manifest.stats.files_found > 0) manifest.stats.files_found -= 1;
              if (file.fileSize && manifest.stats.total_bytes) {
                manifest.stats.total_bytes = Math.max(0, Number(manifest.stats.total_bytes) - Number(file.fileSize));
              }
            }
            await storageProvider.upload(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'), 'application/json');
            logger.info({ manifestKey }, 'manifest_json_updated_after_file_deletion');
          } catch {
            // ignore manifest parse error
          }
        }
      } catch (err) {
        logger.error({ err, runId: run.id }, 'run_jsonl_manifest_sync_failed');
      }
    }

    // Decrement database run counts
    try {
      await prisma.collectionRun.update({
        where: { id: run.id },
        data: {
          filesDownloaded: { decrement: 1 },
          filesFound: { decrement: 1 },
        },
      });
    } catch {
      // Ignore count decrement if already zero
    }
  }
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
      try {
        await prisma.collectedFile.delete({ where: { id: f.id } });
        prunedCount++;
      } catch {
        // Ignore if already deleted
      }
    }
  }

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

export async function approveFile(id: string, userId: string, notes?: string) {
  await getFileById(id);
  const updated = await prisma.collectedFile.update({
    where: { id },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
    include: {
      approvedBy: { select: { id: true, name: true, username: true } },
    },
  });
  return serializeFile(updated);
}

export async function rejectFile(id: string, userId: string, notes?: string) {
  await getFileById(id);
  const updated = await prisma.collectedFile.update({
    where: { id },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
    include: {
      approvedBy: { select: { id: true, name: true, username: true } },
    },
  });
  return serializeFile(updated);
}

export async function bulkApproveFiles(fileIds: string[], userId: string, notes?: string) {
  if (!fileIds.length) return { updatedCount: 0 };
  const res = await prisma.collectedFile.updateMany({
    where: { id: { in: fileIds } },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });
  return { updatedCount: res.count };
}

export async function bulkRejectFiles(fileIds: string[], userId: string, notes?: string) {
  if (!fileIds.length) return { updatedCount: 0 };
  const res = await prisma.collectedFile.updateMany({
    where: { id: { in: fileIds } },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });
  return { updatedCount: res.count };
}

export async function approveRunFiles(runId: string, userId: string, notes?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const reviewerName = user ? (user.name || user.username) : 'Admin';

  // 1. Update all files in DB
  const res = await prisma.collectedFile.updateMany({
    where: { collectionRunId: runId },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });

  // 2. Update the collection run in DB
  await prisma.collectionRun.update({
    where: { id: runId },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });

  // 3. Update storage metadata.jsonl with approval status
  try {
    const run = await prisma.collectionRun.findUnique({ where: { id: runId }, include: { source: true } });
    if (run) {
      const runFolderKey = run.manifestR2Key
        ? run.manifestR2Key.substring(0, run.manifestR2Key.lastIndexOf('/'))
        : run.source
        ? `00_raw/web/${run.source.slug}/${run.runId}`
        : null;

      if (runFolderKey) {
        const metaKey = `${runFolderKey}/metadata.jsonl`;
        const metaBuf = await storageProvider.getBuffer(metaKey);
        if (metaBuf) {
          const lines = metaBuf.toString('utf-8').split('\n').filter((l) => l.trim().length > 0);
          const updatedLines = lines.map((l) => {
            try {
              const obj = JSON.parse(l);
              obj.approval_status = 'APPROVED';
              obj.approved_by = reviewerName;
              obj.approved_at = new Date().toISOString();
              if (notes) obj.approval_notes = notes;
              return JSON.stringify(obj);
            } catch {
              return l;
            }
          });
          await storageProvider.upload(metaKey, Buffer.from(updatedLines.join('\n') + '\n', 'utf-8'), 'application/jsonl');
          logger.info({ metaKey }, 'metadata_jsonl_approved_in_storage');
        }
      }
    }
  } catch (err) {
    logger.error({ err, runId }, 'storage_metadata_approval_sync_failed');
  }

  return { updatedCount: res.count };
}

export async function rejectRunFiles(runId: string, userId: string, notes?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const reviewerName = user ? (user.name || user.username) : 'Admin';

  // 1. Update all files in DB
  const res = await prisma.collectedFile.updateMany({
    where: { collectionRunId: runId },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });

  // 2. Update the collection run in DB
  await prisma.collectionRun.update({
    where: { id: runId },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
  });

  // 3. Update storage metadata.jsonl with rejection status
  try {
    const run = await prisma.collectionRun.findUnique({ where: { id: runId }, include: { source: true } });
    if (run) {
      const runFolderKey = run.manifestR2Key
        ? run.manifestR2Key.substring(0, run.manifestR2Key.lastIndexOf('/'))
        : run.source
        ? `00_raw/web/${run.source.slug}/${run.runId}`
        : null;

      if (runFolderKey) {
        const metaKey = `${runFolderKey}/metadata.jsonl`;
        const metaBuf = await storageProvider.getBuffer(metaKey);
        if (metaBuf) {
          const lines = metaBuf.toString('utf-8').split('\n').filter((l) => l.trim().length > 0);
          const updatedLines = lines.map((l) => {
            try {
              const obj = JSON.parse(l);
              obj.approval_status = 'REJECTED';
              obj.approved_by = reviewerName;
              obj.approved_at = new Date().toISOString();
              if (notes) obj.approval_notes = notes;
              return JSON.stringify(obj);
            } catch {
              return l;
            }
          });
          await storageProvider.upload(metaKey, Buffer.from(updatedLines.join('\n') + '\n', 'utf-8'), 'application/jsonl');
          logger.info({ metaKey }, 'metadata_jsonl_rejected_in_storage');
        }
      }
    }
  } catch (err) {
    logger.error({ err, runId }, 'storage_metadata_rejection_sync_failed');
  }

  return { updatedCount: res.count };
}

