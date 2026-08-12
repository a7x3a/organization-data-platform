import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler. Must be registered LAST with app.use().
 * Never exposes internal stack traces to clients.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Log unexpected errors server-side only
  logger.error(
    {
      err,
      path: req.path,
      method: req.method,
    },
    'Unhandled error'
  );

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
