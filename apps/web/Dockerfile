# ─── Build stage ─────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspace=apps/web --workspace=packages/shared-types --if-present

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/apps/web
RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────
FROM nginx:1.26-alpine AS runtime

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx:alpine ships busybox wget — no extra package needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
