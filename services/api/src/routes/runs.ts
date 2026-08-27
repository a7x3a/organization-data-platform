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
  approveRejectRunSchema,
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
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const result = await runService.listRuns(req.query as Record<string, string>, currentUser);
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
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.getRunById(req.params.id, currentUser);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/runs/:id/manifest — Fetch raw/parsed run manifest JSON
router.get(
  '/:id/manifest',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const manifestData = await runService.getRunManifest(req.params.id, currentUser);
      res.json(manifestData);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/runs/:id/metadata — Fetch run metadata JSONL
router.get(
  '/:id/metadata',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const metadataData = await runService.getRunMetadata(req.params.id, currentUser);
      res.json(metadataData);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/runs/:id — Data Manager+ or run owner. Only terminal-status runs can be cleared
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const deleteFiles = req.query.deleteFiles === 'true' || req.query.deleteFiles === '1';
      await runService.deleteRun(req.params.id, deleteFiles, currentUser);
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
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.cancelRun(req.params.id, req.user!.sub, currentUser);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/force-cancel
router.post(
  '/:id/force-cancel',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.forceCancelRun(req.params.id, req.user!.sub, currentUser);
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
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.pauseRun(req.params.id, req.user!.sub, currentUser);
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
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.resumeRun(req.params.id, req.user!.sub, currentUser);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/approve
router.post(
  '/:id/approve',
  validate(idParamSchema, 'params'),
  validate(approveRejectRunSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.approveRun(req.params.id, req.user!.sub, req.body.notes, currentUser);
      res.json(run);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/runs/:id/reject
router.post(
  '/:id/reject',
  validate(idParamSchema, 'params'),
  validate(approveRejectRunSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const currentUser = req.user ? { sub: req.user.sub, roles: req.user.roles || [] } : undefined;
      const run = await runService.rejectRun(req.params.id, req.user!.sub, req.body.notes, currentUser);
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
      const file = await fileService.recordFile({
        ...req.body,
        collectionRunId: req.body.collectionRunId || req.params.id,
      });
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
