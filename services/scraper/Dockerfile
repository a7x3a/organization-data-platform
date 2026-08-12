# ─── Build stage ─────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY services/scraper/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Install Playwright and Chromium
RUN pip install --no-cache-dir --user playwright==1.44.0 && \
    /root/.local/bin/playwright install chromium --with-deps

# ─── Runtime stage ────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

# Runtime system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy Playwright browsers
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Copy application
COPY services/scraper/app ./app

# Create temp dir
RUN mkdir -p /tmp/scraper

# Health check — verify the worker process is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import redis; r = redis.from_url('${REDIS_URL}'); r.ping()" || exit 1

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

CMD ["python", "-m", "app.main"]
