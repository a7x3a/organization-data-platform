import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
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

// Global rate limiter
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  })
);

// Trust proxy (for accurate client IPs behind Docker/nginx)
app.set('trust proxy', 1);

// ─── Routes ──────────────────────────────────────────────────

app.use('/', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/collectors', collectorsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/files', filesRouter);
app.use('/api/users', usersRouter);

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
