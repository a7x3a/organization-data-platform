import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import type { CreateSourceInput, UpdateSourceInput } from '../schemas/index';

export async function listSources(query: { page?: string; pageSize?: string }) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const [data, total] = await prisma.$transaction([
    prisma.source.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.source.count(),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function getSourceById(id: string) {
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) throw new AppError(404, 'Source not found', 'SOURCE_NOT_FOUND');
  return source;
}

export async function createSource(input: CreateSourceInput) {
  const existing = await prisma.source.findUnique({ where: { slug: input.slug } });
  if (existing) throw new AppError(409, 'A source with this slug already exists', 'SLUG_CONFLICT');

  return prisma.source.create({ data: input });
}

export async function updateSource(id: string, input: UpdateSourceInput) {
  await getSourceById(id); // throws 404 if not found

  if (input.slug) {
    const existing = await prisma.source.findFirst({
      where: { slug: input.slug, id: { not: id } },
    });
    if (existing) throw new AppError(409, 'Slug already in use', 'SLUG_CONFLICT');
  }

  return prisma.source.update({ where: { id }, data: input });
}

import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env';
import { storageProvider } from './storage';

export async function deleteSource(id: string, cascade = true) {
  const source = await getSourceById(id);

  if (!cascade) {
    const collectorCount = await prisma.collector.count({ where: { sourceId: id } });
    if (collectorCount > 0) {
      throw new AppError(
        409,
        'Source has collectors and cannot be deleted. Disable it instead, or delete its collectors first.',
        'SOURCE_HAS_COLLECTORS'
      );
    }

    const fileCount = await prisma.collectedFile.count({ where: { sourceId: id } });
    if (fileCount > 0) {
      throw new AppError(
        409,
        'Source has collected files and cannot be deleted. Disable it instead.',
        'SOURCE_HAS_FILES'
      );
    }
  } else {
    // Delete underlying physical storage objects for all files belonging to this source
    const files = await prisma.collectedFile.findMany({
      where: { sourceId: id, r2Key: { not: null } },
      select: { r2Key: true },
    });

    for (const f of files) {
      if (f.r2Key) {
        try {
          await storageProvider.delete(f.r2Key);
        } catch {
          // Ignore secondary storage deletion errors
        }
      }
    }

    // Cascade delete DB records
    await prisma.collectedFile.deleteMany({ where: { sourceId: id } });
    await prisma.collectionRun.deleteMany({ where: { sourceId: id } });
    await prisma.collector.deleteMany({ where: { sourceId: id } });

    // Clean up physical source directories on local disk
    try {
      const localStorageDir = path.resolve(env.LOCAL_STORAGE_DIR);
      const possibleDirs = [
        path.join(localStorageDir, '00_raw', 'web', source.slug),
        path.join(localStorageDir, '00_raw', 'telegram', source.slug),
        path.join(localStorageDir, '00_raw', 'media', source.slug),
        path.join(localStorageDir, '00_raw', source.slug),
        path.join(localStorageDir, source.slug),
      ];

      for (const dir of possibleDirs) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  await prisma.source.delete({ where: { id } });
}
