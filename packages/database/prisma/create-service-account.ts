/**
 * Bootstrap script — creates the SERVICE_ACCOUNT user the scraper worker
 * authenticates as, and mints a long-lived JWT for it.
 *
 * Every /api/runs and /api/files callback the scraper makes (status updates,
 * file recording, duplicate checks, cancellation checks) sits behind
 * requireAuth. Without a token, those calls 401 — and since the scraper's
 * httpx client doesn't raise on 4xx by default, that 401 is silently
 * absorbed (e.g. _is_cancelled() finds no "status" key on the error body
 * and just returns False). The run looks stuck at PENDING forever even
 * though the scraper is doing real work locally.
 *
 * Interactive user tokens expire in 15m (AUTH_ACCESS_EXPIRES_IN) by design —
 * fine for a browser session that refreshes, wrong for a long-running
 * background worker. This mints a separate, long-lived token instead of
 * changing that global policy.
 *
 * Usage: npm run db:create-service-account --workspace=packages/database
 * Copy the printed token into .env as API_SERVICE_TOKEN, then restart the
 * scraper container.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const USERNAME = 'scraper-worker';

async function main() {
  const secret = process.env.AUTH_ACCESS_SECRET;
  if (!secret) {
    throw new Error('AUTH_ACCESS_SECRET not set — this script needs the same secret the API verifies with.');
  }

  let user = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: USERNAME,
        name: 'Scraper Worker',
        // No login password is ever used for this account — it authenticates
        // via the minted JWT below, never through POST /api/auth/login.
        passwordHash: 'unused',
        isActive: true,
        roles: [UserRole.SERVICE_ACCOUNT],
      },
    });
    console.log(`Created service account user: ${USERNAME}`);
  } else {
    console.log(`Service account user already exists: ${USERNAME}`);
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, roles: user.roles },
    secret,
    { expiresIn: '3650d' }
  );

  console.log('\nAPI_SERVICE_TOKEN=' + token);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
