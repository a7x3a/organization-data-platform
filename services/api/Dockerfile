# ─── Build stage ─────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace manifests first (for better layer caching)
COPY package.json package-lock.json* ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api/package.json ./services/api/

# Install all workspace deps
RUN npm ci --workspace=services/api --workspace=packages/database --workspace=packages/shared-types --if-present

# Prisma detects the OpenSSL version at `generate` time — must match runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy source files
COPY packages/ ./packages/
COPY services/api/ ./services/api/

# Generate Prisma client
WORKDIR /app/packages/database
RUN npx prisma generate

# Build shared-types (real JS/enums, not just type declarations)
WORKDIR /app/packages/shared-types
RUN npm run build

# Build TypeScript
WORKDIR /app/services/api
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Prisma's query engine binary is linked against libssl
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Only copy production dependencies
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /app/services/api/package.json ./services/api/

RUN npm ci --omit=dev --workspace=services/api --workspace=packages/database --workspace=packages/shared-types --if-present

# Copy compiled API
COPY --from=builder /app/services/api/dist ./services/api/dist

# Copy Prisma schema and generated client
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled shared-types
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

# Non-root user for security
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs
USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "services/api/dist/services/api/src/server.js"]
