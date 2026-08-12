import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireDataManager } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createSourceSchema, updateSourceSchema, idParamSchema, paginationSchema } from '../schemas/index';
import * as sourceService from '../services/source.service';

const router = Router();

// All source routes require authentication
router.use(requireAuth);

// GET /api/sources
router.get(
  '/',
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sourceService.listSources(req.query as Record<string, string>);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/sources/:id
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const source = await sourceService.getSourceById(req.params.id);
      res.json(source);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/sources — Data Manager+
router.post(
  '/',
  requireDataManager,
  validate(createSourceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const source = await sourceService.createSource(req.body);
      res.status(201).json(source);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/sources/:id — Data Manager+
router.patch(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  validate(updateSourceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const source = await sourceService.updateSource(req.params.id, req.body);
      res.json(source);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/sources/:id — Data Manager+
router.delete(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sourceService.deleteSource(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
