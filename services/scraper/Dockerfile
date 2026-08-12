# ─── Build stage ─────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Playwright/Chromium first, before requirements.txt — it's by far the
# most expensive layer to rebuild (system apt deps + a browser download).
# Installing it after requirements.txt meant every routine dependency
# change (e.g. adding one pure-Python package) invalidated this layer's
# cache too, forcing a full Chromium re-download on the next build.
RUN pip install --no-cache-dir --user playwright==1.44.0 && \
    /root/.local/bin/playwright install chromium --with-deps

COPY services/scraper/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ─── Runtime stage ────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

# Copy Python packages from builder first — `playwright install-deps`
# below needs the playwright CLI to know which OS packages the installed
# Chromium build actually requires.
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy Playwright's browser binaries
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

# Chromium's OS-level dependencies, resolved by Playwright itself rather
# than a hand-picked apt list — the previous hardcoded list was missing
# libpango-1.0.so.0 (among possibly others), so Chromium failed to even
# launch (`error while loading shared libraries`). That silently broke
# every useBrowser:true collector — the only way to scrape JS-rendered
# sites (Wix, React/Vue SPAs, etc.), which is most of the modern web.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    && playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

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
