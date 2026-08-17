import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireDataManager } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  idParamSchema,
  listRunsQuerySchema,
  updateRunStatusSchema,
  recordFileSchema,
  recordErrorSchema,
} from '../schemas/index';
import * as runService from '../services/run.service';
import * as fileService from '../services/file.service';

const router = Router();

router.use(requireAuth);

// GET /api/runs
router.get(
  '/',
  validate(listRunsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runService.listRuns(req.query as Record<string, string>);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/runs/:id
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await runService.getRunById(req.params.id);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/runs/:id — Data Manager+. Only terminal-status runs (not
// PENDING/RUNNING/CANCEL_REQUESTED) can be cleared — never deletes any
// CollectedFile, only the run record and its own error log rows.
router.delete(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await runService.deleteRun(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/cancel
router.post(
  '/:id/cancel',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await runService.cancelRun(req.params.id, req.user!.sub);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/pause
router.post(
  '/:id/pause',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await runService.pauseRun(req.params.id, req.user!.sub);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/resume
router.post(
  '/:id/resume',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await runService.resumeRun(req.params.id, req.user!.sub);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/runs/:id/status — scraper worker progress callback
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(updateRunStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const run = await runService.updateRunStatus(req.params.id, req.body);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/files — scraper worker file-collected callback
router.post(
  '/:id/files',
  validate(idParamSchema, 'params'),
  validate(recordFileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.recordFile(req.body);
      res.status(201).json(file);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/errors — scraper worker error-report callback
router.post(
  '/:id/errors',
  validate(idParamSchema, 'params'),
  validate(recordErrorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const error = await runService.recordError(req.params.id, req.body);
      res.status(201).json(error);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/runs/dashboard/stats
router.get('/dashboard/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await runService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
