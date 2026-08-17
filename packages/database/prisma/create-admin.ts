/**
 * Bootstrap script — creates the first ADMIN user.
 * There is no public registration endpoint (by design: /api/users is
 * admin-only), so a fresh local database has no way to log in without this.
 *
 * Usage:
 *   npm run db:create-admin --workspace=packages/database -- <username> <password> [name]
 *   npm run db:create-admin --workspace=packages/database          (uses defaults below)
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  const customUser = process.argv[2];
  const customPass = process.argv[3];
  const customName = process.argv[4];

  const defaultUsers = customUser
    ? [{ username: customUser, password: customPass || 'admin12345', name: customName || customUser }]
    : [
        { username: 'a7x3a', password: 'admin12345', name: 'a7x3a' },
        { username: 'admin', password: 'admin12345', name: 'Admin' },
      ];

  for (const u of defaultUsers) {
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      console.log(`User "${u.username}" already exists — skipping.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await prisma.user.create({
      data: {
        username: u.username,
        name: u.name,
        passwordHash,
        isActive: true,
        roles: [UserRole.ADMIN],
      },
    });

    console.log(`Admin user ready: ${u.username} / ${u.password}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
