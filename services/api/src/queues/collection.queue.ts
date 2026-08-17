import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export interface CollectionJobData {
  runId: string;           // CollectionRun database ID
  collectorId: string;
  sourceId: string;
  sourceSlug: string;
  collectorType: string;   // 'WEB' | 'TELEGRAM' | ... — routes to the right job class in the scraper worker
  configuration: unknown;  // CollectorConfiguration JSON (shape depends on collectorType)
  runFolderKey: string;    // R2 prefix: 00_raw/{web|telegram}/{slug}/{run_id}
}

export const COLLECTION_QUEUE_NAME = 'collection';

export const collectionQueue = new Queue<CollectionJobData>(COLLECTION_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

collectionQueue.on('error', (err) => {
  logger.error({ err }, 'collection_queue_error');
});

logger.info({ queue: COLLECTION_QUEUE_NAME }, 'Collection queue initialized');
