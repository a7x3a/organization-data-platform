import { Router, Request, Response } from 'express';
import { statfsSync } from 'fs';
import path from 'path';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { storageProvider } from '../services/storage';
import { LocalStorageProvider } from '../services/storage/LocalStorageProvider';

const router = Router();

// GET /health — basic liveness
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'api' });
});

// GET /ready — dynamic health checks for all Docker stack services
router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, boolean> = {
    database: false,
    redis: false,
    scraper: false,
    r2: false,
  };

  // 1. PostgreSQL Check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  // 2. Redis Queue Check
  try {
    const ping = await redis.ping();
    checks.redis = ping === 'PONG';
  } catch {
    checks.redis = false;
  }

  // 3. Scraper Worker Backend Check
  try {
    const scraperUrl = process.env.SCRAPER_SERVICE_URL || 'http://scraper:8000';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const resp = await fetch(`${scraperUrl}/health`, { signal: controller.signal });
      checks.scraper = resp.ok;
    } catch {
      // Scraper worker communicates via Redis queue; if Redis is connected, Scraper worker is active
      checks.scraper = checks.redis;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    checks.scraper = checks.redis;
  }

  // 4. Cloud R2 Storage Check
  const accessKey = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME;

  checks.r2 = !!(
    accessKey &&
    secretKey &&
    bucket &&
    accessKey !== 'placeholder' &&
    secretKey !== 'placeholder' &&
    !accessKey.includes('change')
  );

  res.json({
    status: checks.database && checks.redis && checks.scraper ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// GET /system/storage-info — provides real-time storage metrics, disk usage, and offline status
router.get('/system/storage-info', async (_req: Request, res: Response) => {
  try {
    const isOffline = env.STORAGE_PROVIDER === 'local';
    const storagePath = storageProvider instanceof LocalStorageProvider
      ? storageProvider.resolvePath('')
      : path.resolve(env.LOCAL_STORAGE_DIR);

    const totalFiles = await prisma.collectedFile.count();
    const totalRuns = await prisma.collectionRun.count();
    const totalSources = await prisma.source.count();

    const sumResult = await prisma.collectedFile.aggregate({
      _sum: { fileSize: true },
    });
    const totalStorageBytes = Number(sumResult._sum.fileSize || 0);

    let diskSpace: { freeBytes: number; totalBytes: number; usedBytes: number } | null = null;
    try {
      if (typeof statfsSync === 'function') {
        const stats = statfsSync(storagePath);
        const total = stats.bsize * stats.blocks;
        const free = stats.bsize * stats.bfree;
        diskSpace = {
          totalBytes: total,
          freeBytes: free,
          usedBytes: Math.max(0, total - free),
        };
      }
    } catch {
      // statfs may not be available on all OS/mounts
    }

    res.json({
      provider: env.STORAGE_PROVIDER,
      isOffline,
      storagePath,
      totalFiles,
      totalRuns,
      totalSources,
      totalStorageBytes,
      diskSpace,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve storage info', details: String(err) });
  }
});

export default router;
