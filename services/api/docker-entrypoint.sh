#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma || echo "Migration failed or database already up to date"

echo "Ensuring admin users exist..."
npx tsx packages/database/prisma/create-admin.ts || echo "Admin creation skipped"

exec "$@"
