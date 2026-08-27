import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { pinoHttp } from 'pino-http';

import { env } from './config/env';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/prisma';
import { connectRedis, disconnectRedis } from './config/redis';
import { errorHandler } from './middleware/errorHandler';

import healthRouter from './routes/health';
import authRouter from './routes/auth';
import sourcesRouter from './routes/sources';
import collectorsRouter from './routes/collectors';
import runsRouter from './routes/runs';
import filesRouter from './routes/files';
import usersRouter from './routes/users';
import telegramRouter from './routes/telegram';
import * as fileService from './services/file.service';

// ─── App setup ───────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet());

// CORS — allow frontend origin only
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Request compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Structured HTTP request logging
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res) => {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Don't log health checks
    autoLogging: {
      ignore: (req) => req.url === '/health' || req.url === '/ready',
    },
  })
);

// Global rate limiter — protects against abusive/runaway PUBLIC (browser)
// traffic. The scraper worker is internal, trusted, and authenticated with
// a long-lived SERVICE_ACCOUNT token, calling back constantly by design
// (cancellation polling, per-file progress/dedup checks) — a single active
// browser-mode crawl with a handful of concurrent pages can legitimately
// fire dozens of these calls per second. Counting that traffic against the
// same 500-per-15-min bucket a real user's browser is limited by meant the
// scraper started getting its own status checks 429'd mid-crawl — and
// since is_cancelled() treats any request failure as "not cancelled", that
// silently made cancellation stop working entirely for as long as the
// worker stayed rate-limited, with no visible error anywhere.
//
// jwt.decode (not verify) is used only to make this skip decision — it is
// not a trust boundary. A forged/unsigned token with a fake SERVICE_ACCOUNT
// role would skip the counter but still 401 at requireAuth downstream,
// exactly as an unskipped forged token would.
function isServiceAccountRequest(req: express.Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    const decoded = jwt.decode(header.slice('Bearer '.length)) as { roles?: string[] } | null;
    return !!decoded?.roles?.includes('SERVICE_ACCOUNT');
  } catch {
    return false;
  }
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Elevated for real-time polling dashboard
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    skip: (req) => req.url.includes('/health') || req.url.includes('/ready') || isServiceAccountRequest(req),
  })
);

// Trust proxy (for accurate client IPs behind Docker/nginx)
app.set('trust proxy', 1);

// ─── Routes ──────────────────────────────────────────────────

app.use('/', healthRouter);
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/collectors', collectorsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/files', filesRouter);
app.use('/api/users', usersRouter);
app.use('/api/telegram', telegramRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — MUST be last
app.use(errorHandler);

// ─── Startup ─────────────────────────────────────────────────

async function start() {
  try {
    await connectDatabase();
    await connectRedis();

    const server = app.listen(env.API_PORT, env.API_HOST, () => {
      logger.info(
        { port: env.API_PORT, host: env.API_HOST, env: env.NODE_ENV },
        'API server started'
      );

      // Background storage directory auto-discovery & healing on startup
      setTimeout(() => {
        fileService.syncStorageDirectories().catch((err: unknown) => {
          logger.warn({ err }, 'startup_storage_sync_warning');
        });
      }, 1000);
    });

    // ─── Graceful Shutdown ────────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(async () => {
        logger.info('HTTP server closed — draining connections');
        try {
          await disconnectDatabase();
          await disconnectRedis();
          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error({ err }, 'Error during shutdown');
          process.exit(1);
        }
      });

      // Force kill after 30s if graceful shutdown hangs
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start API server');
    process.exit(1);
  }
}

start();
