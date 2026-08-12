import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import { collectionQueue } from '../queues/collection.queue';
import { RunStatus } from '@odp/shared-types';
import { logger } from '../utils/logger';
import type { UpdateRunStatusInput, RecordErrorInput } from '../schemas/index';

function generateRunId(datePrefix: string, seq: number): string {
  return `${datePrefix}_run_${String(seq).padStart(6, '0')}`;
}

export async function listRuns(query: {
  page?: string;
  pageSize?: string;
  collectorId?: string;
  sourceId?: string;
  status?: string;
}) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const where: Record<string, unknown> = {};
  if (query.collectorId) where.collectorId = query.collectorId;
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;

  const [data, total] = await prisma.$transaction([
    prisma.collectionRun.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        collector: { select: { id: true, name: true, type: true } },
        source: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.collectionRun.count({ where }),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function getRunById(id: string) {
  const run = await prisma.collectionRun.findUnique({
    where: { id },
    include: {
      collector: { select: { id: true, name: true, type: true, configuration: true } },
      source: { select: { id: true, name: true, slug: true, baseUrl: true } },
    },
  });
  if (!run) throw new AppError(404, 'Collection run not found', 'RUN_NOT_FOUND');
  return run;
}

export async function startCollectionRun(collectorId: string, userId: string) {
  // Verify collector exists and is enabled
  const collector = await prisma.collector.findUnique({
    where: { id: collectorId },
    include: { source: true },
  });

  if (!collector) throw new AppError(404, 'Collector not found', 'COLLECTOR_NOT_FOUND');
  if (!collector.enabled) throw new AppError(400, 'Collector is disabled', 'COLLECTOR_DISABLED');

  // Sequence numbers are derived from the highest existing runId for today,
  // never from a row count — count() breaks the moment any run is deleted
  // (deleteRun makes that possible now), since the next "count + 1" can
  // collide with a runId that still exists. runId's numeric suffix is
  // zero-padded, so string-descending order matches numeric order.
  const datePrefix = new Date().toISOString().slice(0, 10);
  const latestRun = await prisma.collectionRun.findFirst({
    where: { collectorId, runId: { startsWith: `${datePrefix}_run_` } },
    orderBy: { runId: 'desc' },
    select: { runId: true },
  });
  const nextSeq = latestRun ? parseInt(latestRun.runId.split('_run_')[1], 10) + 1 : 1;
  const runId = generateRunId(datePrefix, nextSeq);

  // Create the run record
  const run = await prisma.collectionRun.create({
    data: {
      collectorId,
      sourceId: collector.sourceId,
      runId,
      status: RunStatus.PENDING,
      collectorVersion: collector.version,
    },
  });

  // Enqueue the BullMQ job
  const job = await collectionQueue.add(
    'collection.start',
    {
      runId: run.id,
      collectorId,
      sourceId: collector.sourceId,
      sourceSlug: collector.source.slug,
      configuration: collector.configuration,
      runFolderKey: `00_raw/web/${collector.source.slug}/${runId}`,
    },
    {
      jobId: `collection-${run.id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    }
  );

  logger.info(
    { runId: run.id, jobId: job.id, collectorId, userId },
    'collection_run_queued'
  );

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.started',
      entityType: 'CollectionRun',
      entityId: run.id,
      metadata: { runId: run.runId, collectorId },
    },
  });

  return {
    runId: run.runId,
    collectionRunId: run.id,
    status: run.status,
  };
}

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING, RunStatus.CANCEL_REQUESTED];

// Deleting a run only ever removes the run record + its own error log rows
// (CollectionError cascades). CollectedFile.collectionRunId is ON DELETE SET
// NULL, never a cascade delete — a run being cleared out of the list can
// never take a genuinely collected file down with it.
export async function deleteRun(id: string) {
  const run = await getRunById(id);

  if (ACTIVE_STATUSES.includes(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot delete an active run (status: ${run.status}). Cancel it first.`,
      'RUN_ACTIVE'
    );
  }

  await prisma.collectionRun.delete({ where: { id } });
}

export async function cancelRun(id: string, userId: string) {
  const run = await getRunById(id);

  const cancellableStatuses: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING];
  if (!cancellableStatuses.includes(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot cancel a run with status: ${run.status}`,
      'INVALID_RUN_STATUS'
    );
  }

  const updated = await prisma.collectionRun.update({
    where: { id },
    data: { status: RunStatus.CANCEL_REQUESTED },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.cancel_requested',
      entityType: 'CollectionRun',
      entityId: id,
    },
  });

  logger.info({ runId: id, userId }, 'collection_run_cancel_requested');

  return updated;
}

const TERMINAL_STATUSES: RunStatus[] = [
  RunStatus.COMPLETED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

// Called by the scraper worker to report run progress/completion. errorCount
// is computed from the actual CollectionError rows rather than trusted from
// the caller, since the worker already reports each error independently via
// recordError() — deriving it here keeps the two paths from drifting apart.
export async function updateRunStatus(id: string, input: UpdateRunStatusInput) {
  await getRunById(id); // throws 404 if not found

  const data: Record<string, unknown> = { status: input.status };
  if (input.startedAt) data.startedAt = new Date(input.startedAt);
  if (input.completedAt) data.completedAt = new Date(input.completedAt);
  if (input.manifestR2Key !== undefined) data.manifestR2Key = input.manifestR2Key;
  if (input.filesFound !== undefined) data.filesFound = input.filesFound;
  if (input.filesDownloaded !== undefined) data.filesDownloaded = input.filesDownloaded;
  if (input.filesSkipped !== undefined) data.filesSkipped = input.filesSkipped;
  if (input.filesDuplicate !== undefined) data.filesDuplicate = input.filesDuplicate;
  if (input.filesFailed !== undefined) data.filesFailed = input.filesFailed;
  if (input.pagesCrawled !== undefined) data.pagesCrawled = input.pagesCrawled;

  if (TERMINAL_STATUSES.includes(input.status as RunStatus)) {
    data.errorCount = await prisma.collectionError.count({
      where: { collectionRunId: id },
    });
  }

  return prisma.collectionRun.update({ where: { id }, data });
}

export async function recordError(runId: string, input: RecordErrorInput) {
  await getRunById(runId); // throws 404 if not found

  return prisma.collectionError.create({
    data: {
      collectionRunId: runId,
      errorCode: input.errorCode,
      message: input.message,
      url: input.url,
    },
  });
}

export async function getDashboardStats() {
  const [
    totalSources,
    activeCollectors,
    runningRuns,
    uploadedCount,
    duplicateCount,
    failedCount,
    recentRuns,
  ] = await prisma.$transaction([
    prisma.source.count({ where: { enabled: true } }),
    prisma.collector.count({ where: { enabled: true } }),
    prisma.collectionRun.count({
      where: { status: { in: [RunStatus.RUNNING, RunStatus.PENDING] } },
    }),
    prisma.collectedFile.count({ where: { status: 'UPLOADED' } }),
    prisma.collectedFile.count({ where: { status: 'DUPLICATE' } }),
    prisma.collectedFile.count({ where: { status: 'FAILED' } }),
    prisma.collectionRun.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        collector: { select: { id: true, name: true, type: true } },
        source: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return {
    totalSources,
    activeCollectors,
    runningRuns,
    totalFilesCollected: uploadedCount,
    totalDuplicates: duplicateCount,
    totalFailedFiles: failedCount,
    recentRuns,
  };
}
