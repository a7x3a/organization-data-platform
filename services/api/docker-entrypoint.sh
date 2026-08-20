#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma || npx prisma db push --schema=packages/database/prisma/schema.prisma --accept-data-loss || echo "Migration check complete"

echo "Ensuring admin users exist..."
npx tsx packages/database/prisma/create-admin.ts || echo "Admin creation skipped"

exec "$@"
