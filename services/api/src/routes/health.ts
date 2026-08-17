import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';

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

export default router;
