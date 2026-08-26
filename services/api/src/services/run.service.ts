import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { storageProvider } from './storage';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, toPrismaSkipTake, buildPaginatedResult } from '../utils/pagination';
import { collectionQueue } from '../queues/collection.queue';
import { RunStatus } from '@odp/shared-types';
import { logger } from '../utils/logger';
import type { UpdateRunStatusInput, RecordErrorInput } from '../schemas/index';

function generateRunId(datePrefix: string, seq: number): string {
  return `${datePrefix}_run_${String(seq).padStart(6, '0')}`;
}

interface CurrentUser {
  sub: string;
  roles: string[];
}

function assertCanManageRun(run: { createdById: string | null }, currentUser?: CurrentUser) {
  if (!currentUser) return;
  if (currentUser.roles.includes('ADMIN')) return;
  if (run.createdById && run.createdById !== currentUser.sub) {
    throw new AppError(403, 'You do not have permission to modify or control this run. You can only view its progress and logs.', 'FORBIDDEN');
  }
}

export async function listRuns(
  query: {
    page?: string;
    pageSize?: string;
    collectorId?: string;
    sourceId?: string;
    status?: string;
    approvalStatus?: string;
  },
  _currentUser?: CurrentUser
) {
  const pagination = parsePagination(query);
  const { skip, take } = toPrismaSkipTake(pagination);

  const where: Record<string, unknown> = {};
  if (query.collectorId) where.collectorId = query.collectorId;
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.status) where.status = query.status;
  if (query.approvalStatus) where.approvalStatus = query.approvalStatus;

  // Visibility: All authenticated users can see all runs across all users
  const [data, total] = await prisma.$transaction([
    prisma.collectionRun.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        collector: { select: { id: true, name: true, type: true } },
        source: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, name: true, username: true } },
        approvedBy: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.collectionRun.count({ where }),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function getRunById(id: string, _currentUser?: CurrentUser) {
  const run = await prisma.collectionRun.findUnique({
    where: { id },
    include: {
      collector: { select: { id: true, name: true, type: true, configuration: true } },
      source: { select: { id: true, name: true, slug: true, baseUrl: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      approvedBy: { select: { id: true, name: true, username: true } },
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

  // Verify user exists if userId is passed
  let validUserId: string | null = null;
  if (userId) {
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (userExists) {
      validUserId = userExists.id;
    }
  }

  const datePrefix = new Date().toISOString().slice(0, 10);
  const latestRun = await prisma.collectionRun.findFirst({
    where: { runId: { startsWith: `${datePrefix}_run_` } },
    orderBy: { runId: 'desc' },
    select: { runId: true },
  });
  const nextSeq = latestRun ? parseInt(latestRun.runId.split('_run_')[1], 10) + 1 : 1;
  const runId = generateRunId(datePrefix, nextSeq);

  // Create the run record attached to the launching user
  const run = await prisma.collectionRun.create({
    data: {
      collectorId,
      sourceId: collector.sourceId,
      runId,
      status: RunStatus.PENDING,
      collectorVersion: collector.version,
      createdById: validUserId,
    },
  });

  const zone = collector.type === 'TELEGRAM' ? 'telegram' : 'web';

  // Per-User Telegram Session support: If Telegram collector, attach user's session credentials
  let telegramCredentials: Record<string, unknown> | undefined = undefined;
  if (collector.type === 'TELEGRAM' && validUserId) {
    try {
      const userSession = await prisma.userTelegramSession.findUnique({
        where: { userId: validUserId },
      });
      if (userSession && userSession.sessionString) {
        telegramCredentials = {
          sessionString: userSession.sessionString,
          apiId: userSession.apiId,
          apiHash: userSession.apiHash,
          phoneNumber: userSession.phoneNumber,
          isVerified: userSession.isVerified,
        };
      }
    } catch (err) {
      logger.warn({ err, userId: validUserId }, 'failed_to_fetch_user_telegram_session');
    }
  }

  const job = await collectionQueue.add(
    'collection.start',
    {
      runId: run.id,
      collectorId,
      sourceId: collector.sourceId,
      sourceSlug: collector.source.slug,
      collectorType: collector.type,
      configuration: collector.configuration,
      telegramCredentials,
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
    { runId: run.id, jobId: job.id, collectorId, userId: validUserId, hasUserTelegram: !!telegramCredentials },
    'collection_run_queued'
  );

  if (validUserId) {
    await prisma.auditLog.create({
      data: {
        userId: validUserId,
        action: 'run.started',
        entityType: 'CollectionRun',
        entityId: run.id,
        metadata: { runId: run.runId, collectorId },
      },
    });
  }

  return {
    runId: run.runId,
    collectionRunId: run.id,
    status: run.status,
  };
}

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING, RunStatus.CANCEL_REQUESTED];

export async function deleteRun(id: string, deleteFiles: boolean = false, currentUser?: CurrentUser) {
  const run = await getRunById(id, currentUser);
  assertCanManageRun(run, currentUser);

  if (ACTIVE_STATUSES.includes(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot delete an active run (status: ${run.status}). Cancel it first.`,
      'RUN_ACTIVE'
    );
  }

  if (deleteFiles) {
    const files = await prisma.collectedFile.findMany({
      where: { collectionRunId: run.id },
      select: { id: true, r2Key: true },
    });
    for (const f of files) {
      if (f.r2Key) {
        try {
          await storageProvider.delete(f.r2Key);
        } catch (err) {
          logger.warn({ r2Key: f.r2Key, err }, 'Failed to delete storage file during run purge');
        }
      }
    }
    await prisma.collectedFile.deleteMany({
      where: { collectionRunId: run.id },
    });
  }

  await prisma.collectionRun.delete({ where: { id: run.id } });
}

export async function cancelRun(id: string, userId: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

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

export async function forceCancelRun(id: string, userId: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

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

export async function pauseRun(id: string, userId: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

  if (run.status === RunStatus.PAUSED) {
    return run;
  }

  const pausableStatuses: RunStatus[] = [RunStatus.PENDING, RunStatus.RUNNING, RunStatus.CANCEL_REQUESTED];
  if (!cancellableStatusesCheck(run.status as RunStatus)) {
    throw new AppError(
      400,
      `Cannot pause a run with status: ${run.status}`,
      'INVALID_RUN_STATUS'
    );
  }

  try {
    await redis.set(`pause_run:${run.id}`, '1');
    await redis.set(`pause_run:${run.runId}`, '1');
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to set pause flag in Redis');
  }

  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: { status: RunStatus.PAUSED },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.paused',
      entityType: 'CollectionRun',
      entityId: run.id,
    },
  });

  logger.info({ runId: run.id, userId }, 'collection_run_paused');
  return updated;
}

function cancellableStatusesCheck(status: RunStatus) {
  return [RunStatus.PENDING, RunStatus.RUNNING, RunStatus.CANCEL_REQUESTED].includes(status);
}

export async function resumeRun(id: string, userId: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

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
    await redis.del(`pause_run:${run.id}`);
    await redis.del(`pause_run:${run.runId}`);
  } catch (err) {
    logger.warn({ runId: id, err }, 'Failed to delete pause flag in Redis');
  }

  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: { status: RunStatus.RUNNING },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.resumed',
      entityType: 'CollectionRun',
      entityId: run.id,
    },
  });

  logger.info({ runId: run.id, userId }, 'collection_run_resumed');
  return updated;
}

export async function approveRun(id: string, userId: string, notes?: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
    include: {
      collector: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      approvedBy: { select: { id: true, name: true, username: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.approved',
      entityType: 'CollectionRun',
      entityId: run.id,
      metadata: { runId: run.runId, notes },
    },
  });

  logger.info({ runId: run.id, userId }, 'collection_run_approved');
  return updated;
}

export async function rejectRun(id: string, userId: string, notes?: string, currentUser?: CurrentUser) {
  const run = await getRunById(id);
  assertCanManageRun(run, currentUser);

  const updated = await prisma.collectionRun.update({
    where: { id: run.id },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: userId,
      approvedAt: new Date(),
      approvalNotes: notes || null,
    },
    include: {
      collector: { select: { id: true, name: true, type: true } },
      source: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      approvedBy: { select: { id: true, name: true, username: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'run.rejected',
      entityType: 'CollectionRun',
      entityId: run.id,
      metadata: { runId: run.runId, notes },
    },
  });

  logger.info({ runId: run.id, userId }, 'collection_run_rejected');
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

export async function getRunManifest(id: string, currentUser?: CurrentUser) {
  const run = await getRunById(id, currentUser);
  const typeFolder = run.collector?.type?.toLowerCase() === 'telegram' ? 'telegram' : 'web';
  const slug = run.source?.slug || 'unknown';
  const manifestKey = run.manifestR2Key || `00_raw/${typeFolder}/${slug}/${run.runId}/manifest.json`;

  const buf = await storageProvider.getBuffer(manifestKey);
  if (!buf) {
    throw new AppError(404, 'Run manifest file not found on storage', 'MANIFEST_NOT_FOUND');
  }

  try {
    const json = JSON.parse(buf.toString('utf-8'));
    return { manifestKey, manifest: json };
  } catch {
    return { manifestKey, raw: buf.toString('utf-8') };
  }
}

export async function getRunMetadata(id: string, currentUser?: CurrentUser) {
  const run = await getRunById(id, currentUser);
  const typeFolder = run.collector?.type?.toLowerCase() === 'telegram' ? 'telegram' : 'web';
  const slug = run.source?.slug || 'unknown';
  const metadataKey = `00_raw/${typeFolder}/${slug}/${run.runId}/metadata.jsonl`;

  const buf = await storageProvider.getBuffer(metadataKey);
  if (!buf) {
    throw new AppError(404, 'Run metadata file not found on storage', 'METADATA_NOT_FOUND');
  }

  const raw = buf.toString('utf-8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });

  return { metadataKey, lines, count: lines.length, raw };
}
