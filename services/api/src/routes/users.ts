import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createUserSchema } from '../schemas/index';
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

// POST /api/users — Admin only. Roles determine what the account can do
// (e.g. COLLECTOR to run/upload collections, DATA_MANAGER to manage sources).
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

export default router;
