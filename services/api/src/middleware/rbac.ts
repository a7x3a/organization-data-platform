import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@odp/shared-types';

/**
 * Require the authenticated user to have at least one of the specified roles.
 * Must be used AFTER requireAuth middleware.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const hasRole = roles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        required: roles,
        actual: req.user.roles,
      });
      return;
    }

    next();
  };
}

// Convenience shortcuts
export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireDataManager = requireRole(UserRole.ADMIN, UserRole.DATA_MANAGER);
export const requireCollector = requireRole(
  UserRole.ADMIN,
  UserRole.DATA_MANAGER,
  UserRole.COLLECTOR
);
