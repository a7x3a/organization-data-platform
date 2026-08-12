import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireDataManager, requireCollector } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createCollectorSchema,
  updateCollectorSchema,
  idParamSchema,
  paginationSchema,
} from '../schemas/index';
import * as collectorService from '../services/collector.service';
import * as runService from '../services/run.service';

const router = Router();

router.use(requireAuth);

// GET /api/collectors
router.get(
  '/',
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await collectorService.listCollectors(
        req.query as Record<string, string>
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/collectors/:id
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collector = await collectorService.getCollectorById(req.params.id);
      res.json(collector);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/collectors
router.post(
  '/',
  requireDataManager,
  validate(createCollectorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collector = await collectorService.createCollector(req.body);
      res.status(201).json(collector);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/collectors/:id
router.patch(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  validate(updateCollectorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collector = await collectorService.updateCollector(req.params.id, req.body);
      res.json(collector);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/collectors/:id
router.delete(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await collectorService.deleteCollector(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/collectors/:id/run — Collector+
router.post(
  '/:id/run',
  requireCollector,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await runService.startCollectionRun(
        req.params.id,
        req.user!.sub
      );
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/collectors/:id/enable
router.post(
  '/:id/enable',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collector = await collectorService.enableCollector(req.params.id);
      res.json(collector);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/collectors/:id/disable
router.post(
  '/:id/disable',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collector = await collectorService.disableCollector(req.params.id);
      res.json(collector);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
