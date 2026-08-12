import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import type { CreateCollectorInput, UpdateCollectorInput } from '../schemas/index';

export async function listCollectors(query: {
  page?: string;
  pageSize?: string;
  sourceId?: string;
}) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);
  const where = query.sourceId ? { sourceId: query.sourceId } : {};

  const [data, total] = await prisma.$transaction([
    prisma.collector.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { source: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.collector.count({ where }),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function getCollectorById(id: string) {
  const collector = await prisma.collector.findUnique({
    where: { id },
    include: { source: { select: { id: true, name: true, slug: true, baseUrl: true } } },
  });
  if (!collector) throw new AppError(404, 'Collector not found', 'COLLECTOR_NOT_FOUND');
  return collector;
}

export async function createCollector(input: CreateCollectorInput) {
  // Verify source exists
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new AppError(404, 'Source not found', 'SOURCE_NOT_FOUND');

  return prisma.collector.create({
    data: {
      ...input,
      configuration: input.configuration as object,
    },
    include: { source: { select: { id: true, name: true, slug: true } } },
  });
}

export async function updateCollector(id: string, input: UpdateCollectorInput) {
  await getCollectorById(id);

  return prisma.collector.update({
    where: { id },
    data: {
      ...input,
      ...(input.configuration && { configuration: input.configuration as object }),
    },
    include: { source: { select: { id: true, name: true, slug: true } } },
  });
}

export async function deleteCollector(id: string) {
  await getCollectorById(id);

  const runCount = await prisma.collectionRun.count({ where: { collectorId: id } });
  if (runCount > 0) {
    throw new AppError(
      409,
      'Collector has collection runs and cannot be deleted. Disable it instead.',
      'COLLECTOR_HAS_RUNS'
    );
  }

  await prisma.collector.delete({ where: { id } });
}

export async function enableCollector(id: string) {
  await getCollectorById(id);
  return prisma.collector.update({ where: { id }, data: { enabled: true } });
}

export async function disableCollector(id: string) {
  await getCollectorById(id);
  return prisma.collector.update({ where: { id }, data: { enabled: false } });
}
