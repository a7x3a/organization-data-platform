import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import { storageProvider } from './storage';
import { formatFileId } from '../utils/fileId';
import { canonicalFilename, categorizeFile } from '../utils/naming';
import type { RecordFileInput, ManualEntryInput } from '../schemas/index';

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
