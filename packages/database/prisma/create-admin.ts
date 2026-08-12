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
  const [username = 'admin', password = 'admin12345', name = 'Admin'] = process.argv.slice(2);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`User "${username}" already exists — nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.create({
    data: {
      username,
      name,
      passwordHash,
      isActive: true,
      roles: [UserRole.ADMIN],
    },
  });

  console.log(`Admin user ready: ${username} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
