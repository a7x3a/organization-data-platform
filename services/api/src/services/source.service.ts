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

export async function deleteSource(id: string) {
  await getSourceById(id);

  const collectorCount = await prisma.collector.count({ where: { sourceId: id } });
  if (collectorCount > 0) {
    throw new AppError(
      409,
      'Source has collectors and cannot be deleted. Disable it instead, or delete its collectors first.',
      'SOURCE_HAS_COLLECTORS'
    );
  }

  await prisma.source.delete({ where: { id } });
}
