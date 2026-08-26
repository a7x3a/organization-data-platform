import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '@odp/shared-types';
import { JwtPayload } from '../middleware/auth';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.AUTH_ACCESS_SECRET, {
    expiresIn: env.AUTH_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.AUTH_REFRESH_SECRET, {
    expiresIn: env.AUTH_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyRefreshToken(token: string): { sub: string } {
  try {
    return jwt.verify(token, env.AUTH_REFRESH_SECRET) as { sub: string };
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

function toPublicUser(user: {
  id: string;
  username: string;
  email: string | null;
  name: string;
  roles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    roles: user.roles,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function loginUser(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.isActive) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    username: user.username,
    roles: user.roles as UserRole[],
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user.id);

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive', 'USER_INACTIVE');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    username: user.username,
    roles: user.roles as UserRole[],
  });

  const newRefreshToken = signRefreshToken(user.id);

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 15 * 60,
  };
}

// General-purpose user creation, used by both the admin bootstrap script and
// the user-management API. Roles default to [] — callers must decide what a
// new account can do (e.g. COLLECTOR to scrape/upload, DATA_MANAGER to manage
// sources).
export async function createUser(input: {
  username: string;
  password: string;
  name?: string;
  roles?: UserRole[];
  email?: string | null;
}) {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) {
    throw new AppError(409, 'Username already taken', 'USERNAME_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email || null,
      name: input.name || input.username,
      passwordHash,
      isActive: true,
      roles: input.roles && input.roles.length > 0 ? input.roles : [UserRole.COLLECTOR],
    },
  });

  return toPublicUser(user);
}

// Seed the first admin account (used by bootstrap scripts, not exposed via API)
export async function createAdminUser(username: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;

  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: {
      username,
      name,
      passwordHash,
      isActive: true,
      roles: [UserRole.ADMIN],
    },
  });
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  return users.map(toPublicUser);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  return toPublicUser(user);
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    email?: string | null;
    password?: string;
    roles?: UserRole[];
    isActive?: boolean;
  },
  currentUserId?: string
) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

  // Prevent user from deactivating themselves
  if (input.isActive === false && currentUserId && id === currentUserId) {
    throw new AppError(400, 'You cannot deactivate your own account', 'CANNOT_DEACTIVATE_SELF');
  }

  // Prevent removing the last active Admin
  if (input.roles && target.roles.includes(UserRole.ADMIN) && !input.roles.includes(UserRole.ADMIN)) {
    const otherAdmins = await prisma.user.count({
      where: {
        roles: { has: UserRole.ADMIN },
        isActive: true,
        id: { not: id },
      },
    });
    if (otherAdmins === 0) {
      throw new AppError(400, 'Cannot remove the last active Admin role', 'LAST_ADMIN_REQUIRED');
    }
  }

  let passwordHash: string | undefined;
  if (input.password && input.password.trim()) {
    passwordHash = await hashPassword(input.password);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.roles !== undefined && { roles: input.roles }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(passwordHash && { passwordHash }),
    },
  });

  return toPublicUser(updated);
}

export async function deleteUser(id: string, currentUserId?: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

  if (currentUserId && id === currentUserId) {
    throw new AppError(400, 'You cannot delete your own account', 'CANNOT_DELETE_SELF');
  }

  if (target.roles.includes(UserRole.ADMIN)) {
    const otherAdmins = await prisma.user.count({
      where: {
        roles: { has: UserRole.ADMIN },
        isActive: true,
        id: { not: id },
      },
    });
    if (otherAdmins === 0) {
      throw new AppError(400, 'Cannot delete the last active Admin user', 'LAST_ADMIN_REQUIRED');
    }
  }

  await prisma.user.delete({ where: { id } });
}
