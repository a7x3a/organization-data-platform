import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import { storageProvider } from './storage';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
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
  extension?: string;
  category?: string;
  search?: string;
}) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const where: Record<string, unknown> = {};
  if (query.collectionRunId) {
    const run = await prisma.collectionRun.findFirst({
      where: { OR: [{ id: query.collectionRunId }, { runId: query.collectionRunId }] },
      select: { id: true },
    });
    if (run) {
      where.collectionRunId = run.id;
    } else {
      where.collectionRunId = query.collectionRunId;
    }
  }
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;
  if (query.approvalStatus) where.approvalStatus = query.approvalStatus;
  if (query.sourceUrl) where.sourceUrl = query.sourceUrl;
  if (query.sha256) where.sha256 = query.sha256;

  if (query.extension) {
    const rawExt = query.extension.toLowerCase().trim();
    const extWithDot = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
    const extWithoutDot = rawExt.startsWith('.') ? rawExt.slice(1) : rawExt;
    where.extension = { in: [extWithDot, extWithoutDot] };
  }

  if (query.category) {
    const cat = query.category.toLowerCase().trim();
    if (cat === 'pdf') {
      where.OR = [
        { extension: { in: ['.pdf', 'pdf'] } },
        { mimeType: { contains: 'pdf', mode: 'insensitive' } },
        { r2Key: { contains: '/pdf/', mode: 'insensitive' } },
      ];
    } else if (cat === 'digital' || cat === 'pdf_digital' || cat === 'digital_pdf') {
      where.OR = [
        { r2Key: { contains: '/pdf/digital/' } },
        { r2Key: { contains: '/pdf/native/decoded/' } },
        { r2Key: { contains: '/pdf/native/' } },
      ];
    } else if (cat === 'ocr' || cat === 'pdf_ocr' || cat === 'ocr_pdf') {
      where.OR = [
        { r2Key: { contains: '/pdf/ocr/' } },
        { r2Key: { contains: '/ocr/' } },
      ];
    } else if (cat === 'web_data' || cat === 'web' || cat === 'articles') {
      where.OR = [
        { r2Key: { contains: '/data/web_content/' } },
        { r2Key: { contains: '/web_content/' } },
      ];
    } else if (cat === 'ebooks' || cat === 'books') {
      where.OR = [
        { extension: { in: ['.epub', '.mobi', '.azw3', '.fb2', '.djvu', '.pdf', 'epub', 'mobi', 'azw3', 'fb2', 'djvu', 'pdf'] } },
        { mimeType: { in: ['application/epub+zip', 'application/x-mobipocket-ebook', 'application/pdf'] } },
      ];
    } else if (cat === 'documents') {
      where.OR = [
        { extension: { in: ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md', '.pages', 'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md'] } },
        { mimeType: { in: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'] } },
      ];
    } else if (cat === 'audio') {
      where.OR = [
        { mimeType: { startsWith: 'audio/' } },
        { extension: { in: ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac', 'mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac'] } },
      ];
    } else if (cat === 'video') {
      where.OR = [
        { mimeType: { startsWith: 'video/' } },
        { extension: { in: ['.mp4', '.mkv', '.avi', '.mov', '.webm', 'mp4', 'mkv', 'avi', 'mov', 'webm'] } },
      ];
    } else if (cat === 'images') {
      where.OR = [
        { mimeType: { startsWith: 'image/' } },
        { extension: { in: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'] } },
      ];
    } else if (cat === 'datasets') {
      where.OR = [
        { extension: { in: ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml', '.arrow', 'parquet', 'jsonl', 'csv', 'tsv', 'json', 'xml', 'arrow'] } },
        { mimeType: { in: ['application/json', 'application/jsonlines', 'text/csv', 'application/xml'] } },
      ];
    }
  }

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    where.OR = [
      { fileName: { contains: term, mode: 'insensitive' } },
      { originalFilename: { contains: term, mode: 'insensitive' } },
      { sourceUrl: { contains: term, mode: 'insensitive' } },
    ];
  }

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

export async function getNextFileId(): Promise<string> {
  const lastFile = await prisma.collectedFile.findFirst({
    where: { fileId: { startsWith: 'RAW-' } },
    orderBy: { fileId: 'desc' },
    select: { fileId: true },
  });

  let nextNum = 1;
  if (lastFile?.fileId) {
    const match = lastFile.fileId.match(/^RAW-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  const count = await prisma.collectedFile.count();
  nextNum = Math.max(nextNum, count + 1);

  while (true) {
    const candidate = formatFileId(nextNum);
    const exists = await prisma.collectedFile.findUnique({
      where: { fileId: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
    nextNum++;
  }
}

// Called by the scraper worker to record a downloaded/duplicate/failed file.
export async function recordFile(input: RecordFileInput) {
  let targetRunId = input.collectionRunId;
  let targetSourceId = input.sourceId;

  // Resolve collectionRunId if it is a display ID or string
  if (targetRunId) {
    const run = await prisma.collectionRun.findFirst({
      where: { OR: [{ id: targetRunId }, { runId: targetRunId }] },
      select: { id: true, sourceId: true },
    });
    if (run) {
      targetRunId = run.id;
      if (!targetSourceId) targetSourceId = run.sourceId;
    }
  }

  // If sourceId is missing, resolve from sourceSlug or run
  if (!targetSourceId && input.sourceId) {
    const src = await prisma.source.findFirst({
      where: { OR: [{ id: input.sourceId }, { slug: input.sourceId }] },
      select: { id: true },
    });
    if (src) targetSourceId = src.id;
  }

  const ext = input.extension || path.extname(input.fileName).toLowerCase() || null;

  // Check if file with sha256 or r2Key already exists
  if (input.sha256 || input.r2Key) {
    const existing = await prisma.collectedFile.findFirst({
      where: {
        OR: [
          input.sha256 ? { sha256: input.sha256 } : undefined,
          input.r2Key ? { r2Key: input.r2Key } : undefined,
        ].filter(Boolean) as any,
      },
    });
    if (existing) {
      const updated = await prisma.collectedFile.update({
        where: { id: existing.id },
        data: {
          collectionRunId: targetRunId || existing.collectionRunId,
          sourceId: targetSourceId || existing.sourceId,
          status: input.status,
          r2Key: input.r2Key || existing.r2Key,
          metadata: input.metadata ? (input.metadata as any) : existing.metadata,
        },
      });
      return serializeFile(updated);
    }
  }

  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    try {
      const fileId = await getNextFileId();
      const canonical = canonicalFilename(input.fileName, fileId, ext);
      const file = await prisma.collectedFile.create({
        data: {
          fileId,
          collectionRunId: targetRunId,
          sourceId: targetSourceId!,
          sourceUrl: input.sourceUrl || null,
          finalUrl: input.finalUrl || null,
          fileName: input.fileName,
          originalFilename: input.fileName,
          canonicalFilename: canonical,
          extension: ext,
          mimeType: input.mimeType || null,
          fileSize: input.fileSize !== undefined ? BigInt(input.fileSize) : null,
          sha256: input.sha256 || crypto.createHash('sha256').update(input.fileName).digest('hex'),
          r2Key: input.r2Key || null,
          status: input.status,
          metadata: input.metadata ? (input.metadata as any) : undefined,
          downloadedAt: input.status === 'UPLOADED' ? new Date() : null,
        },
      });
      return serializeFile(file);
    } catch (err: any) {
      if (err?.code === 'P2002' && attempts < 5) {
        continue;
      }
      throw err;
    }
  }
  throw new AppError(500, 'Failed to reserve unique file ID after multiple attempts', 'FILE_ID_GENERATION_FAILED');
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

  const fileId = await getNextFileId();
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

  const fileId = await getNextFileId();

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

export function beautifySourceMetadata(slug: string, rawName?: string, rawBaseUrl?: string) {
  let cleanSlug = slug.toLowerCase().trim();

  // Telegram detection
  if (cleanSlug.startsWith('telegram-') || cleanSlug.startsWith('tg-') || (rawBaseUrl && rawBaseUrl.includes('t.me/'))) {
    const channel = cleanSlug.replace(/^(telegram-|tg-)/, '').replace(/@/, '');
    return {
      name: `Telegram: @${channel}`,
      slug: `telegram-${channel}`,
      baseUrl: `https://t.me/${channel}`,
      description: `Telegram Channel Collector for @${channel}`,
    };
  }

  // Domain reconstruction from slug
  let domain = cleanSlug;

  // Replace common TLD patterns from hyphenated slugs
  domain = domain
    .replace(/^www[-_]/i, 'www.')
    .replace(/[-_]gov[-_]krd$/i, '.gov.krd')
    .replace(/[-_]gov[-_]iq$/i, '.gov.iq')
    .replace(/[-_]com$/i, '.com')
    .replace(/[-_]org$/i, '.org')
    .replace(/[-_]net$/i, '.net')
    .replace(/[-_]krd$/i, '.krd')
    .replace(/[-_]iq$/i, '.iq')
    .replace(/[-_]edu$/i, '.edu')
    .replace(/[-_]info$/i, '.info')
    .replace(/[-_]io$/i, '.io')
    .replace(/[-_]ai$/i, '.ai')
    .replace(/[-_]me$/i, '.me')
    .replace(/[-_]tv$/i, '.tv');

  if (domain.startsWith('diyako-yageyziman')) {
    domain = domain.replace('diyako-yageyziman', 'diyako.yageyziman');
  }

  // Derive a clean, human-readable Title
  let cleanName = rawName;
  const isMangledName =
    !cleanName ||
    cleanName.includes('WWW ') ||
    cleanName.includes(' COM') ||
    cleanName.includes(' ORG') ||
    cleanName.includes(' NET') ||
    cleanName.includes(' KRD') ||
    cleanName.includes('-') ||
    cleanName === cleanName.toUpperCase() ||
    cleanName.toLowerCase() === slug.toLowerCase();

  if (isMangledName) {
    const lowerSlug = cleanSlug.toLowerCase();
    if (lowerSlug.includes('basnews')) {
      cleanName = 'BasNews';
    } else if (lowerSlug.includes('kurdishcentral')) {
      cleanName = 'Kurdish Central';
    } else if (lowerSlug.includes('diyako') && lowerSlug.includes('yageyziman')) {
      cleanName = 'Diyako (Yagey Ziman)';
    } else if (lowerSlug.includes('yageyziman')) {
      cleanName = 'Yagey Ziman';
    } else if (lowerSlug === 'gov-krd' || lowerSlug === 'gov.krd') {
      cleanName = 'Gov.krd (Kurdistan Regional Government)';
    } else if (lowerSlug.includes('rudaw')) {
      cleanName = 'Rudaw';
    } else {
      let nameCore = domain.replace(/^www\./i, '').replace(/\.(com|org|net|krd|iq|gov|edu|info|io|ai|me|tv)$/i, '');
      cleanName = nameCore
        .split(/[-_.]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // Derive clean Base URL
  let cleanBaseUrl = rawBaseUrl;
  if (
    !cleanBaseUrl ||
    cleanBaseUrl.includes('-com.com') ||
    cleanBaseUrl.includes('-org.com') ||
    cleanBaseUrl.endsWith('-krd.com') ||
    cleanBaseUrl.includes('https://www-') ||
    cleanBaseUrl.includes('https://diyako-yageyziman-')
  ) {
    cleanBaseUrl = `https://${domain}`;
  } else if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
    cleanBaseUrl = `https://${cleanBaseUrl}`;
  }

  return {
    name: cleanName || cleanSlug,
    slug: cleanSlug,
    baseUrl: cleanBaseUrl,
    description: `Auto-created source for ${domain}`,
  };
}

function extractSourceAndRunFromRelKey(relKey: string): {
  sourceSlug: string;
  runKey: string | null;
} {
  const parts = relKey.replace(/\\/g, '/').split('/').filter(Boolean);
  let sourceSlug = 'recovered-source';
  let runKey: string | null = null;

  if (parts.length === 0) return { sourceSlug, runKey };

  if (parts[0] === '00_raw' || parts[0] === 'raw') {
    if (parts.length >= 3 && ['web', 'telegram', 'media', 'data'].includes(parts[1].toLowerCase())) {
      sourceSlug = parts[2];
      if (parts.length >= 5) {
        runKey = parts[3];
      } else if (parts.length === 4 && !parts[3].includes('.')) {
        runKey = parts[3];
      }
    } else if (parts.length >= 2) {
      sourceSlug = parts[1];
      if (parts.length >= 4) {
        runKey = parts[2];
      } else if (parts.length === 3 && !parts[2].includes('.')) {
        runKey = parts[2];
      }
    }
  } else if (['web', 'telegram', 'media', 'data'].includes(parts[0].toLowerCase())) {
    if (parts.length >= 2) {
      sourceSlug = parts[1];
      if (parts.length >= 4) {
        runKey = parts[2];
      } else if (parts.length === 3 && !parts[2].includes('.')) {
        runKey = parts[2];
      }
    }
  } else {
    sourceSlug = parts[0];
    if (parts.length >= 3) {
      runKey = parts[1];
    } else if (parts.length === 2 && !parts[1].includes('.')) {
      runKey = parts[1];
    }
  }

  // Also check if any segment explicitly looks like a run identifier
  if (!runKey) {
    for (const segment of parts) {
      if (
        segment.includes('_run_') ||
        segment.startsWith('run_') ||
        /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment) ||
        /^202\d{5}/.test(segment) ||
        /^202\d-\d\d-\d\d/.test(segment)
      ) {
        runKey = segment;
        break;
      }
    }
  }

  return { sourceSlug, runKey };
}

export async function syncStorageDirectories() {
  let syncedCount = 0;
  let missingCount = 0;
  let indexedNewCount = 0;
  let restoredRunsCount = 0;
  let restoredMetadataCount = 0;

  const localStorageDir = storageProvider instanceof LocalStorageProvider
    ? storageProvider.resolvePath('')
    : path.resolve(env.LOCAL_STORAGE_DIR);

  // PASS 0A: Self-heal any 'RAW-UNKNOWN' or malformed fileIds directly in PostgreSQL
  const unknownFiles = await prisma.collectedFile.findMany({
    where: { OR: [{ fileId: 'RAW-UNKNOWN' }, { fileId: { contains: 'UNKNOWN' } }] },
    select: { id: true },
  });
  for (const uf of unknownFiles) {
    const freshId = await getNextFileId();
    await prisma.collectedFile.update({
      where: { id: uf.id },
      data: { fileId: freshId },
    });
    restoredMetadataCount++;
  }

  const dbFiles = await prisma.collectedFile.findMany({
    select: { id: true, r2Key: true, sha256: true, status: true, collectionRunId: true, sourceId: true },
  });

  const existingR2KeysInDb = new Set<string>();
  const existingSha256InDb = new Set<string>();

  for (const f of dbFiles) {
    if (f.r2Key) {
      existingR2KeysInDb.add(f.r2Key);
      existingR2KeysInDb.add(f.r2Key.replace(/^[/\\]+/, ''));
    }
    if (f.sha256) {
      existingSha256InDb.add(f.sha256.toLowerCase());
    }
  }

  // 1. Reconcile DB -> Storage: verify files in DB without deleting any database records
  for (const f of dbFiles) {
    if (f.r2Key) {
      const exists = await storageProvider.exists(f.r2Key);
      if (exists) {
        syncedCount++;
      } else {
        missingCount++;
      }
    }
  }

  try {
    // PASS 0B: Clean up and heal any existing damaged / mangled source names and URLs in the DB
    const allExistingSources = await prisma.source.findMany();
    for (const s of allExistingSources) {
      const fixed = beautifySourceMetadata(s.slug, s.name, s.baseUrl);
      if (fixed.name !== s.name || fixed.baseUrl !== s.baseUrl) {
        await prisma.source.update({
          where: { id: s.id },
          data: {
            name: fixed.name,
            baseUrl: fixed.baseUrl,
            description: s.description?.startsWith('Auto-created') ? fixed.description : s.description,
          },
        });
        logger.info({ oldName: s.name, newName: fixed.name, oldUrl: s.baseUrl, newUrl: fixed.baseUrl }, 'healed_source_metadata');
      }
    }

    // Helper: walk directory recursively
    async function walkDir(dir: string): Promise<string[]> {
      let fileList: string[] = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const nested = await walkDir(fullPath);
            fileList = fileList.concat(nested);
          } else if (entry.isFile()) {
            fileList.push(fullPath);
          }
        }
      } catch {
        // directory may not exist yet
      }
      return fileList;
    }

    const allDiskFiles = await walkDir(localStorageDir);
    const sources = await prisma.source.findMany();
    const sourceMap = new Map<string, string>();
    for (const s of sources) {
      sourceMap.set(s.slug.toLowerCase(), s.id);
      sourceMap.set(s.name.toLowerCase(), s.id);
    }

    const runs = await prisma.collectionRun.findMany();
    const runMap = new Map<string, string>();
    for (const r of runs) {
      runMap.set(r.runId.toLowerCase(), r.id);
      runMap.set(r.runId, r.id);
      runMap.set(r.id.toLowerCase(), r.id);
      runMap.set(r.id, r.id);
    }

    // Helper to get or create source by slug
    async function getOrCreateSource(slug: string, rawName?: string, rawBaseUrl?: string): Promise<string> {
      const meta = beautifySourceMetadata(slug, rawName, rawBaseUrl);
      const normalizedSlug = meta.slug;
      if (sourceMap.has(normalizedSlug)) {
        return sourceMap.get(normalizedSlug)!;
      }
      const newSource = await prisma.source.create({
        data: {
          name: meta.name,
          slug: normalizedSlug,
          baseUrl: meta.baseUrl,
          description: meta.description,
          robotsPolicy: 'RESPECT',
          enabled: true,
        },
      });
      sourceMap.set(normalizedSlug, newSource.id);
      sourceMap.set(newSource.name.toLowerCase(), newSource.id);
      return newSource.id;
    }

    // Helper to get or create collector
    async function getOrCreateCollector(sourceId: string, name = 'Auto-Discovered Web Crawler'): Promise<string> {
      const existing = await prisma.collector.findFirst({
        where: { sourceId },
      });
      if (existing) return existing.id;
      const newC = await prisma.collector.create({
        data: {
          sourceId,
          name,
          type: 'WEB',
          configuration: { maxPages: 500, maxDepth: 4 },
          enabled: true,
        },
      });
      return newC.id;
    }

    // Helper to get or create collection run
    async function getOrCreateRun(runId: string, sourceId: string, collectorId?: string): Promise<string> {
      const normKey = runId.toLowerCase();
      if (runMap.has(normKey)) {
        return runMap.get(normKey)!;
      }
      if (runMap.has(runId)) {
        return runMap.get(runId)!;
      }

      const existing = await prisma.collectionRun.findFirst({
        where: { OR: [{ runId }, { id: runId }] },
      });
      if (existing) {
        runMap.set(normKey, existing.id);
        runMap.set(runId, existing.id);
        return existing.id;
      }

      const cId = collectorId || (await getOrCreateCollector(sourceId));
      const newRun = await prisma.collectionRun.create({
        data: {
          runId,
          sourceId,
          collectorId: cId,
          status: 'COMPLETED',
          startedAt: new Date(),
          completedAt: new Date(),
          pagesCrawled: 1,
          filesDownloaded: 1,
        },
      });
      runMap.set(normKey, newRun.id);
      runMap.set(runId, newRun.id);
      restoredRunsCount++;
      return newRun.id;
    }

    // Categorize disk files
    const manifestFiles = allDiskFiles.filter((f) => path.basename(f) === 'manifest.json');
    const metadataJsonlFiles = allDiskFiles.filter((f) => path.basename(f) === 'metadata.jsonl');
    const contentFiles = allDiskFiles.filter(
      (f) => path.basename(f) !== 'manifest.json' && path.basename(f) !== 'metadata.jsonl'
    );

    // PASS 1: Recover from manifest.json
    for (const mFile of manifestFiles) {
      try {
        const rawContent = await fs.readFile(mFile, 'utf-8');
        const manifest = JSON.parse(rawContent);
        const relKey = path.relative(localStorageDir, mFile).replace(/\\/g, '/');
        const info = extractSourceAndRunFromRelKey(relKey);

        let sourceSlug = manifest.source_slug || manifest.target_slug || info.sourceSlug;
        const sourceId = await getOrCreateSource(
          sourceSlug,
          manifest.source_name,
          manifest.base_url || manifest.start_url
        );
        const collectorId = await getOrCreateCollector(sourceId, manifest.collector_name);

        const runId = manifest.run_id || info.runKey || `run_${Date.now()}`;
        const existingRun = await prisma.collectionRun.findFirst({
          where: { OR: [{ runId }, { id: runId }] },
        });

        if (!existingRun) {
          const newRun = await prisma.collectionRun.create({
            data: {
              runId,
              sourceId,
              collectorId,
              status: manifest.status || 'COMPLETED',
              startedAt: manifest.started_at ? new Date(manifest.started_at) : new Date(),
              completedAt: manifest.completed_at ? new Date(manifest.completed_at) : new Date(),
              pagesCrawled: Number(manifest.pages_crawled || manifest.stats?.pages_crawled || manifest.stats?.pages_visited || 0),
              filesDownloaded: Number(manifest.files_downloaded || manifest.stats?.files_downloaded || manifest.stats?.total_files || 0),
              filesFound: Number(manifest.files_found || manifest.stats?.files_found || 0),
              filesDuplicate: Number(manifest.files_duplicate || manifest.stats?.files_duplicate || 0),
              filesFailed: Number(manifest.files_failed || manifest.stats?.files_failed || 0),
              manifestR2Key: relKey,
            },
          });
          runMap.set(runId.toLowerCase(), newRun.id);
          runMap.set(runId, newRun.id);
          restoredRunsCount++;
        } else if (!existingRun.manifestR2Key) {
          await prisma.collectionRun.update({
            where: { id: existingRun.id },
            data: { manifestR2Key: relKey },
          });
        }
      } catch (err) {
        logger.warn({ mFile, err }, 'failed_to_parse_manifest_json');
      }
    }

    // PASS 2: Recover rich metadata from metadata.jsonl & auto-heal run associations & heal RAW-UNKNOWN
    for (const jsonlFile of metadataJsonlFiles) {
      try {
        const rawContent = await fs.readFile(jsonlFile, 'utf-8');
        const lines = rawContent.split('\n').filter((l) => l.trim().length > 0);
        const relDir = path.dirname(path.relative(localStorageDir, jsonlFile)).replace(/\\/g, '/');
        const info = extractSourceAndRunFromRelKey(relDir);
        let hasModifiedLines = false;
        const updatedLines: string[] = [];

        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const sha256 = (obj.sha256 || '').toLowerCase();
            const relKey = obj.relative_path || obj.r2_key || (obj.file_name ? `${relDir}/${obj.file_name}` : null);
            const fileName = obj.file_name || obj.title || (relKey ? path.basename(relKey) : 'document');
            const ext = obj.extension || path.extname(fileName).toLowerCase() || '.json';

            const sourceId = await getOrCreateSource(obj.source_slug || info.sourceSlug);
            let collectionRunId: string | null = null;
            const targetRunKey = obj.run_id || info.runKey;
            if (targetRunKey) {
              collectionRunId = await getOrCreateRun(targetRunKey, sourceId);
            }

            let validFileId = obj.file_id;
            if (!validFileId || validFileId === 'RAW-UNKNOWN' || validFileId.includes('UNKNOWN')) {
              validFileId = await getNextFileId();
              obj.file_id = validFileId;
              hasModifiedLines = true;
            }

            // Check if file is already in DB
            const existingFile = await prisma.collectedFile.findFirst({
              where: {
                OR: [
                  sha256 ? { sha256 } : undefined,
                  relKey ? { r2Key: relKey } : undefined,
                ].filter(Boolean) as any,
              },
            });

            if (existingFile) {
              const updates: Record<string, unknown> = {};
              if (!existingFile.collectionRunId && collectionRunId) {
                updates.collectionRunId = collectionRunId;
              }
              if (!existingFile.sourceId && sourceId) {
                updates.sourceId = sourceId;
              }
              if (existingFile.fileId === 'RAW-UNKNOWN' || existingFile.fileId.includes('UNKNOWN')) {
                updates.fileId = validFileId;
              }
              if (Object.keys(updates).length > 0) {
                await prisma.collectedFile.update({
                  where: { id: existingFile.id },
                  data: updates,
                });
              }
              if (sha256) existingSha256InDb.add(sha256);
              if (relKey) existingR2KeysInDb.add(relKey);
              updatedLines.push(JSON.stringify(obj));
              continue;
            }

            const canonical = canonicalFilename(fileName, validFileId, ext);

            await prisma.collectedFile.create({
              data: {
                fileId: validFileId,
                sourceId,
                collectionRunId,
                sourceUrl: obj.url || obj.source_url || null,
                finalUrl: obj.final_url || obj.url || null,
                fileName,
                originalFilename: obj.original_filename || fileName,
                canonicalFilename: canonical,
                extension: ext,
                mimeType: obj.mime_type || (ext === '.pdf' ? 'application/pdf' : ext === '.json' ? 'application/json' : 'application/octet-stream'),
                fileSize: BigInt(obj.file_size || obj.size || 0),
                sha256: sha256 || crypto.createHash('sha256').update(line).digest('hex'),
                r2Key: relKey || `${relDir}/${fileName}`,
                status: 'UPLOADED',
                metadata: obj.metadata || {
                  title: obj.title,
                  word_count: obj.word_count,
                  quality: obj.quality,
                  language: obj.language,
                  kurdish_category: obj.kurdish_category,
                  headings: obj.headings,
                  paragraphs: obj.paragraphs,
                  body_text: obj.body_text,
                },
                downloadedAt: obj.downloaded_at ? new Date(obj.downloaded_at) : new Date(),
              },
            });

            if (sha256) existingSha256InDb.add(sha256);
            if (relKey) existingR2KeysInDb.add(relKey);
            restoredMetadataCount++;
            indexedNewCount++;
            syncedCount++;
            updatedLines.push(JSON.stringify(obj));
          } catch {
            updatedLines.push(line);
          }
        }

        // Rewrite healed metadata.jsonl if any IDs were updated
        if (hasModifiedLines && updatedLines.length > 0) {
          try {
            await fs.writeFile(jsonlFile, updatedLines.join('\n') + '\n', 'utf-8');
            logger.info({ jsonlFile }, 'healed_metadata_jsonl_saved');
          } catch {
            // ignore
          }
        }
      } catch (err) {
        logger.warn({ jsonlFile, err }, 'failed_to_process_metadata_jsonl');
      }
    }

    // PASS 3: Index all standalone / uncataloged content files on disk
    for (const diskFile of contentFiles) {
      const relKey = path.relative(localStorageDir, diskFile).replace(/\\/g, '/');
      const ext = path.extname(diskFile).toLowerCase();
      const baseName = path.basename(diskFile);
      const info = extractSourceAndRunFromRelKey(relKey);

      try {
        const fileBuf = await fs.readFile(diskFile);
        const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex').toLowerCase();

        const sourceId = await getOrCreateSource(info.sourceSlug);
        let collectionRunId: string | null = null;
        if (info.runKey) {
          collectionRunId = await getOrCreateRun(info.runKey, sourceId);
        }

        // Check if file is already in DB by r2Key or sha256
        const existingInDb = await prisma.collectedFile.findFirst({
          where: {
            OR: [{ r2Key: relKey }, { sha256 }],
          },
        });

        if (existingInDb) {
          if (!existingInDb.collectionRunId && collectionRunId) {
            await prisma.collectedFile.update({
              where: { id: existingInDb.id },
              data: { collectionRunId },
            });
          }
          if (!existingInDb.sourceId && sourceId) {
            await prisma.collectedFile.update({
              where: { id: existingInDb.id },
              data: { sourceId },
            });
          }
          existingR2KeysInDb.add(relKey);
          existingSha256InDb.add(sha256);
          continue;
        }

        const stat = await fs.stat(diskFile);

        // If JSON file, check if it contains article metadata
        let metadata: Record<string, unknown> | undefined;
        if (ext === '.json') {
          try {
            const parsed = JSON.parse(fileBuf.toString('utf-8'));
            if (typeof parsed === 'object' && parsed !== null) {
              metadata = parsed;
            }
          } catch {
            // ignore
          }
        }

        const fileId = await getNextFileId();

        let mimeType = 'application/octet-stream';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.json') mimeType = 'application/json';
        else if (ext === '.html' || ext === '.htm') mimeType = 'text/html; charset=utf-8';
        else if (ext === '.txt') mimeType = 'text/plain; charset=utf-8';
        else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.mp3') mimeType = 'audio/mpeg';
        else if (ext === '.mp4') mimeType = 'video/mp4';

        await prisma.collectedFile.create({
          data: {
            fileId,
            sourceId,
            collectionRunId,
            fileName: baseName,
            originalFilename: baseName,
            canonicalFilename: canonicalFilename(baseName, fileId, ext),
            extension: ext,
            mimeType,
            fileSize: BigInt(stat.size),
            sha256,
            r2Key: relKey,
            status: 'UPLOADED',
            metadata: metadata ? (metadata as any) : undefined,
            downloadedAt: stat.mtime || new Date(),
          },
        });

        existingR2KeysInDb.add(relKey);
        existingSha256InDb.add(sha256);
        indexedNewCount++;
        syncedCount++;
      } catch (err) {
        logger.warn({ diskFile, err }, 'failed_to_index_discovered_disk_file');
      }
    }

    // PASS 4: Self-heal any orphan records in PostgreSQL where collectionRunId is null
    const orphanFiles = await prisma.collectedFile.findMany({
      where: { collectionRunId: null },
      select: { id: true, r2Key: true, sourceId: true },
      take: 10000,
    });
    for (const ofile of orphanFiles) {
      if (ofile.r2Key) {
        const { sourceSlug, runKey } = extractSourceAndRunFromRelKey(ofile.r2Key);
        if (runKey) {
          const sId = ofile.sourceId || (await getOrCreateSource(sourceSlug));
          const rId = await getOrCreateRun(runKey, sId);
          await prisma.collectedFile.update({
            where: { id: ofile.id },
            data: { collectionRunId: rId, sourceId: sId },
          });
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, 'storage_directory_scan_failed');
  }

  // 5. Recalculate all collection run statistics to match actual records in database
  try {
    const allRuns = await prisma.collectionRun.findMany({ select: { id: true } });
    for (const r of allRuns) {
      const actualUploadedCount = await prisma.collectedFile.count({
        where: { collectionRunId: r.id, status: 'UPLOADED' },
      });
      const actualDuplicateCount = await prisma.collectedFile.count({
        where: { collectionRunId: r.id, status: 'DUPLICATE' },
      });
      const actualFailedCount = await prisma.collectedFile.count({
        where: { collectionRunId: r.id, status: 'FAILED' },
      });
      const totalCount = await prisma.collectedFile.count({
        where: { collectionRunId: r.id },
      });

      await prisma.collectionRun.update({
        where: { id: r.id },
        data: {
          filesDownloaded: actualUploadedCount,
          filesFound: Math.max(actualUploadedCount, totalCount),
          filesDuplicate: actualDuplicateCount,
          filesFailed: actualFailedCount,
        },
      });
    }
  } catch {
    // ignore
  }

  logger.info(
    {
      syncedCount,
      indexedNewCount,
      restoredRunsCount,
      restoredMetadataCount,
      missingCount,
    },
    'storage_synchronization_and_recovery_completed'
  );

  return {
    provider: env.STORAGE_PROVIDER,
    totalChecked: dbFiles.length + indexedNewCount,
    syncedCount,
    indexedNewCount,
    restoredRunsCount,
    restoredMetadataCount,
    missingCount,
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

export async function bulkDeleteFiles(fileIds: string[]) {
  if (!fileIds.length) return { deletedCount: 0 };

  const files = await prisma.collectedFile.findMany({
    where: { id: { in: fileIds } },
    include: { collectionRun: { include: { source: true } } },
  });

  if (!files.length) return { deletedCount: 0 };

  // 1. Delete stored objects
  for (const file of files) {
    if (file.r2Key) {
      try {
        await storageProvider.delete(file.r2Key);
      } catch (err) {
        logger.error({ err, fileId: file.id, r2Key: file.r2Key }, 'bulk_file_storage_delete_failed');
      }
    }
  }

  // 2. Delete database rows
  await prisma.collectedFile.deleteMany({
    where: { id: { in: fileIds } },
  });

  // 3. Update collection run metadata & manifest for affected runs
  const affectedRunIds = Array.from(
    new Set(files.map((f) => f.collectionRunId).filter((id): id is string => Boolean(id)))
  );

  for (const runId of affectedRunIds) {
    const runFiles = files.filter((f) => f.collectionRunId === runId);
    const run = runFiles[0]?.collectionRun;
    if (!run) continue;

    const runFolderKey = run.manifestR2Key
      ? run.manifestR2Key.substring(0, run.manifestR2Key.lastIndexOf('/'))
      : run.source
      ? `00_raw/web/${run.source.slug}/${run.runId}`
      : null;

    if (runFolderKey) {
      try {
        // Update root metadata.jsonl
        const metaKey = `${runFolderKey}/metadata.jsonl`;
        const metaBuf = await storageProvider.getBuffer(metaKey);
        if (metaBuf) {
          const lines = metaBuf.toString('utf-8').split('\n').filter((l) => l.trim().length > 0);
          const deletedSha256s = new Set(runFiles.map((f) => f.sha256?.toLowerCase()).filter(Boolean));
          const deletedFileIds = new Set(runFiles.map((f) => f.fileId).filter(Boolean));
          const updatedLines = lines.filter((l) => {
            try {
              const obj = JSON.parse(l);
              if (obj.sha256 && deletedSha256s.has(obj.sha256.toLowerCase())) return false;
              if (obj.file_id && deletedFileIds.has(obj.file_id)) return false;
              return true;
            } catch {
              return true;
            }
          });
          const newContent = updatedLines.length > 0 ? updatedLines.join('\n') + '\n' : '';
          await storageProvider.upload(metaKey, Buffer.from(newContent, 'utf-8'), 'application/jsonl');
        }

        // Update manifest.json
        const manifestKey = `${runFolderKey}/manifest.json`;
        const manifestBuf = await storageProvider.getBuffer(manifestKey);
        if (manifestBuf) {
          try {
            const manifest = JSON.parse(manifestBuf.toString('utf-8'));
            if (manifest.stats) {
              manifest.stats.files_downloaded = Math.max(0, manifest.stats.files_downloaded - runFiles.length);
              manifest.stats.files_found = Math.max(0, manifest.stats.files_found - runFiles.length);
              const totalDeletedBytes = runFiles.reduce((acc, f) => acc + (f.fileSize ? Number(f.fileSize) : 0), 0);
              if (manifest.stats.total_bytes) {
                manifest.stats.total_bytes = Math.max(0, Number(manifest.stats.total_bytes) - totalDeletedBytes);
              }
            }
            await storageProvider.upload(manifestKey, Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'), 'application/json');
          } catch {
            // ignore
          }
        }
      } catch (err) {
        logger.error({ err, runId }, 'bulk_delete_manifest_sync_failed');
      }
    }

    // Decrement run counts in DB
    try {
      await prisma.collectionRun.update({
        where: { id: runId },
        data: {
          filesDownloaded: { decrement: runFiles.length },
          filesFound: { decrement: runFiles.length },
        },
      });
    } catch {
      // ignore
    }
  }

  return { deletedCount: files.length };
}

export async function pruneRunFiles(
  runId: string,
  options: {
    keepExtensions?: string[];
    keepCategories?: string[];
    deleteExtensions?: string[];
  }
) {
  const allFiles = await prisma.collectedFile.findMany({
    where: { collectionRunId: runId },
    include: { collectionRun: { include: { source: true } } },
  });

  if (!allFiles.length) {
    return { prunedCount: 0, remainingCount: 0, totalBytesFreed: 0 };
  }

  const normalizedKeepExts = (options.keepExtensions || []).map((e) => {
    const raw = e.toLowerCase().trim();
    return raw.startsWith('.') ? raw : `.${raw}`;
  });

  const keepCategories = (options.keepCategories || []).map((c) => c.toLowerCase().trim());
  const deleteExts = (options.deleteExtensions || []).map((e) => {
    const raw = e.toLowerCase().trim();
    return raw.startsWith('.') ? raw : `.${raw}`;
  });

  const filesToPrune = allFiles.filter((file) => {
    const ext = (file.extension || '').toLowerCase();
    const mime = (file.mimeType || '').toLowerCase();

    // If explicit deleteExtensions provided
    if (deleteExts.length > 0 && deleteExts.includes(ext)) {
      return true;
    }

    // If keepCategories provided (e.g. ['pdf'])
    if (keepCategories.length > 0) {
      const matchesCategory = keepCategories.some((cat) => {
        if (cat === 'pdf') return ext === '.pdf' || mime.includes('pdf');
        if (cat === 'ebooks' || cat === 'books') return ['.epub', '.mobi', '.azw3', '.fb2', '.djvu', '.pdf'].includes(ext);
        if (cat === 'documents') return ['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md'].includes(ext);
        if (cat === 'audio') return mime.startsWith('audio/') || ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a', '.aac'].includes(ext);
        if (cat === 'video') return mime.startsWith('video/') || ['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext);
        if (cat === 'images') return mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'].includes(ext);
        if (cat === 'datasets') return ['.parquet', '.jsonl', '.csv', '.tsv', '.json', '.xml'].includes(ext);
        return false;
      });
      if (!matchesCategory) return true;
    }

    // If keepExtensions provided (e.g. ['.pdf'])
    if (normalizedKeepExts.length > 0) {
      if (!normalizedKeepExts.includes(ext)) {
        return true;
      }
    }

    return false;
  });

  if (!filesToPrune.length) {
    return { prunedCount: 0, remainingCount: allFiles.length, totalBytesFreed: 0 };
  }

  const pruneIds = filesToPrune.map((f) => f.id);
  const totalBytesFreed = filesToPrune.reduce((acc, f) => acc + (f.fileSize ? Number(f.fileSize) : 0), 0);

  await bulkDeleteFiles(pruneIds);

  return {
    prunedCount: filesToPrune.length,
    remainingCount: allFiles.length - filesToPrune.length,
    totalBytesFreed,
  };
}

