import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { UserRole } from '@odp/shared-types';

export interface JwtPayload {
  sub: string;        // user id
  username: string;
  roles: UserRole[];
  iat: number;
  exp: number;
}

// Extends Express Request with the decoded JWT user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required by Express's own type-augmentation pattern
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header', code: 'UNAUTHORIZED' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.AUTH_ACCESS_SECRET) as JwtPayload;

    // Verify user still exists in database and has not been deleted or deactivated
    let dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, roles: true, username: true },
    });

    if (!dbUser && (payload.roles?.includes(UserRole.SERVICE_ACCOUNT) || payload.username === 'scraper-worker')) {
      dbUser = await prisma.user.findUnique({
        where: { username: 'scraper-worker' },
        select: { id: true, isActive: true, roles: true, username: true },
      });
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            username: 'scraper-worker',
            name: 'Scraper Worker',
            passwordHash: 'unused',
            isActive: true,
            roles: [UserRole.SERVICE_ACCOUNT],
          },
          select: { id: true, isActive: true, roles: true, username: true },
        });
      }
    }

    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({
        error: 'User account has been deleted or deactivated',
        code: 'USER_DELETED_OR_INACTIVE',
      });
      return;
    }

    req.user = {
      ...payload,
      sub: dbUser.id,
      roles: dbUser.roles as UserRole[],
      username: dbUser.username,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.AUTH_ACCESS_SECRET) as JwtPayload;
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, roles: true, username: true },
    });
    if (dbUser && dbUser.isActive) {
      req.user = {
        ...payload,
        sub: dbUser.id,
        roles: dbUser.roles as UserRole[],
        username: dbUser.username,
      };
    }
  } catch {
    // optional auth, continue gracefully
  }
  next();
}
