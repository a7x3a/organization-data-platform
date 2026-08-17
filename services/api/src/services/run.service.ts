import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
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
      // Capped rather than unbounded — a pathological run (thousands of
      // per-file failures) shouldn't turn every run-detail fetch into an
      // unbounded row scan. Newest first: the reason a run is FAILED is
      // almost always one of its most recent errors, not its first.
      errors: { orderBy: { createdAt: 'desc' }, take: 50 },
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
  //
  // Deliberately NOT scoped to collectorId — CollectionRun.runId is a single
  // globally-unique column (schema.prisma), not unique per collector. Scoping
  // this lookup by collectorId meant two different collectors both starting
  // their first run of the day computed the same "next" sequence (1 each),
  // both tried to create "..._run_000001", and the second one 500'd on a
  // unique-constraint violation — which is exactly what silently broke every
  // *other* collector's first run after any one collector had already taken
  // run_000001 for the day.
  const datePrefix = new Date().toISOString().slice(0, 10);
  const latestRun = await prisma.collectionRun.findFirst({
    where: { runId: { startsWith: `${datePrefix}_run_` } },
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

  // R2 zone per collector type — 00_raw/web/... for WEB, 00_raw/telegram/...
  // for TELEGRAM, matching the platform's storage layout (see
  // WEB_COLLECTION_PLATFORM_PLAN.md §5). Falls back to 'web' for any other
  // (not-yet-implemented) collector type rather than producing an invalid key.
  const zone = collector.type === 'TELEGRAM' ? 'telegram' : 'web';

  // Enqueue the BullMQ job
  const job = await collectionQueue.add(
    'collection.start',
    {
      runId: run.id,
      collectorId,
      sourceId: collector.sourceId,
      sourceSlug: collector.source.slug,
      collectorType: collector.type,
      configuration: collector.configuration,
      runFolderKey: `00_raw/${zone}/${collector.source.slug}/${runId}`,
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

  if (run.status === RunStatus.CANCELLED) {
    return run;
  }

  const cancellableStatuses: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING, RunStatus.PAUSED, RunStatus.CANCEL_REQUESTED];
  if (!cancellableStatuses.includes(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot cancel a run with status: ${run.status}`,
      'INVALID_RUN_STATUS'
    );
  }

  // Attempt to remove job from BullMQ queue if still pending/active
  try {
    const job = (await collectionQueue.getJob(`collection-${run.id}`)) || (await collectionQueue.getJob(`collection-${run.runId}`));
    if (job) {
      const state = await job.getState();
      if (state === 'active') {
        await job.moveToFailed(new Error('Cancel requested by user'), '0', true);
      } else {
        await job.remove();
      }
    }
  } catch (err) {
    logger.warn({ runId: id, err }, 'Could not remove BullMQ job during cancel');
  }

  try {
    await redis.set(`cancel_run:${run.id}`, '1', 'EX', 3600);
    await redis.set(`cancel_run:${run.runId}`, '1', 'EX', 3600);
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to set cancel flag in Redis');
  }

  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: { status: RunStatus.CANCEL_REQUESTED },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.cancel_requested',
      entityType: 'CollectionRun',
      entityId: run.id,
    },
  });

  logger.info({ runId: run.id, userId }, 'collection_run_cancel_requested');

  return updated;
}

export async function forceCancelRun(id: string, userId: string) {
  const run = await getRunById(id);

  try {
    const job = (await collectionQueue.getJob(`collection-${run.id}`)) || (await collectionQueue.getJob(`collection-${run.runId}`));
    if (job) {
      const state = await job.getState();
      if (state === 'active') {
        await job.moveToFailed(new Error('Force stopped by user'), '0', true);
      } else {
        await job.remove();
      }
    }
  } catch (err) {
    logger.warn({ runId: id, err }, 'Could not remove/abort BullMQ job during force cancel');
  }

  try {
    await redis.set(`cancel_run:${run.id}`, '1', 'EX', 3600);
    await redis.set(`cancel_run:${run.runId}`, '1', 'EX', 3600);
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to set cancel flag in Redis');
  }

  const completedAt = new Date();
  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: {
      status: RunStatus.CANCELLED,
      completedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.force_cancelled',
      entityType: 'CollectionRun',
      entityId: id,
    },
  });

  logger.info({ runId: id, userId }, 'collection_run_force_cancelled');
  return updated;
}

export async function pauseRun(id: string, userId: string) {
  const run = await getRunById(id);

  if (run.status === RunStatus.PAUSED) {
    return run;
  }

  const pausableStatuses: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING];
  if (!pausableStatuses.includes(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot pause a run with status: ${run.status}`,
      'INVALID_RUN_STATUS'
    );
  }

  try {
    await redis.set(`pause_run:${id}`, '1');
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to set pause flag in Redis');
  }

  const updated = await prisma.collectionRun.update({
    where: { id },
    data: { status: RunStatus.PAUSED },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.paused',
      entityType: 'CollectionRun',
      entityId: id,
    },
  });

  logger.info({ runId: id, userId }, 'collection_run_paused');
  return updated;
}

export async function resumeRun(id: string, userId: string) {
  const run = await getRunById(id);

  if (run.status === RunStatus.RUNNING) {
    return run;
  }

  if (run.status !== RunStatus.PAUSED) {
    throw new AppError(
      400,
      `Cannot resume a run with status: ${run.status}`,
      'INVALID_RUN_STATUS'
    );
  }

  try {
    await redis.del(`pause_run:${id}`);
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to delete pause flag in Redis');
  }

  const updated = await prisma.collectionRun.update({
    where: { id },
    data: { status: RunStatus.RUNNING },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.resumed',
      entityType: 'CollectionRun',
      entityId: id,
    },
  });

  logger.info({ runId: id, userId }, 'collection_run_resumed');
  return updated;
}

const TERMINAL_STATUSES: RunStatus[] = [
  RunStatus.COMPLETED,
  RunStatus.FAILED,
  RunStatus.CANCELLED,
];

// Statuses the worker must never be allowed to downgrade back to RUNNING via
// a progress-only update. Cancellation used to be silently un-doable: the
// worker calls this endpoint after nearly every file to report incremental
// counts, hardcoding status: "RUNNING" each time — so the moment a user
// requested cancellation, the very next progress report overwrote
// CANCEL_REQUESTED back to RUNNING before the worker's own cancellation
// check ever got a chance to see it, and the run churned on regardless.
const STATUSES_PROTECTED_FROM_RUNNING_REVERT: RunStatus[] = [
  RunStatus.CANCEL_REQUESTED,
  RunStatus.CANCELLED,
  RunStatus.COMPLETED,
  RunStatus.FAILED,
];

// Called by the scraper worker to report run progress/completion. errorCount
// is computed from the actual CollectionError rows rather than trusted from
// the caller, since the worker already reports each error independently via
// recordError() — deriving it here keeps the two paths from drifting apart.
export async function updateRunStatus(id: string, input: UpdateRunStatusInput) {
  const current = await getRunById(id); // throws 404 if not found

  const data: Record<string, unknown> = {};
  const isProgressOnlyRunningReport =
    input.status === RunStatus.RUNNING &&
    STATUSES_PROTECTED_FROM_RUNNING_REVERT.includes(current.status as RunStatus);
  if (!isProgressOnlyRunningReport) {
    data.status = input.status;
  }
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
