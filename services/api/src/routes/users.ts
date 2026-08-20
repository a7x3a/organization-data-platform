import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { idParamSchema, createUserSchema, updateUserSchema } from '../schemas/index';
import * as authService from '../services/auth.service';

const router = Router();

router.use(requireAuth);

// GET /api/users — Admin only
router.get('/', requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await authService.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id — Admin only
router.get(
  '/:id',
  requireAdmin,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.getUserById(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/users — Admin only. Roles determine what the account can do
router.post(
  '/',
  requireAdmin,
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.createUser(req.body);
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/users/:id — Admin only
router.patch(
  '/:id',
  requireAdmin,
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await authService.updateUser(req.params.id, req.body, req.user!.sub);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/users/:id — Admin only
router.delete(
  '/:id',
  requireAdmin,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.deleteUser(req.params.id, req.user!.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
