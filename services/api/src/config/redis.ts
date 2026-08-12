import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('close', () => logger.warn('Redis connection closed'));

export async function connectRedis(): Promise<void> {
  // BullMQ issues commands against `redis` as soon as a Queue/Worker is
  // constructed, which triggers ioredis's lazyConnect before this function
  // runs. Calling .connect() on an already-connecting client throws, so
  // only connect here if nothing has touched the client yet.
  if (redis.status === 'wait') {
    await redis.connect();
  }
  logger.info('Redis ready');
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}
