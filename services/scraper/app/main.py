"""
Scraper Worker Entry Point.

Listens for BullMQ jobs from Redis and dispatches them to CollectionJob.
Handles graceful shutdown on SIGTERM/SIGINT.
"""
import asyncio
import json
import os
import signal
import sys

import httpx
import structlog
import redis.asyncio as aioredis

from app.config.settings import settings
from app.jobs.collection_job import CollectionJob

# Configure structlog
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

log = structlog.get_logger()

QUEUE_NAME = "collection"
JOB_KEY_PREFIX = f"bull:{QUEUE_NAME}"

# Graceful shutdown flag
_shutdown = asyncio.Event()


def handle_signal(sig: int, frame) -> None:  # type: ignore
    log.info("shutdown_signal_received", signal=sig)
    _shutdown.set()


async def process_job(job_data: dict, api_client: httpx.AsyncClient) -> None:
    """Process a single BullMQ job."""
    job = CollectionJob(job_data, api_client)
    await job.run()


async def consume_jobs(redis_client: aioredis.Redis, api_client: httpx.AsyncClient) -> None:
    """
    Simple BullMQ-compatible job consumer using Redis BLPOP.

    BullMQ stores jobs in the `bull:{queue}:wait` list.
    Workers BLPOP from this list and then move to active.
    This is a simplified consumer — a full BullMQ Python library
    would handle stalled jobs and retries automatically.
    """
    wait_key = f"bull:{QUEUE_NAME}:wait"
    active_key = f"bull:{QUEUE_NAME}:active"

    log.info("scraper_worker_started", queue=QUEUE_NAME, concurrency=settings.worker_concurrency)

    semaphore = asyncio.Semaphore(settings.worker_concurrency)
    tasks: set[asyncio.Task] = set()

    while not _shutdown.is_set():
        try:
            # Non-blocking check
            job_id_bytes = await redis_client.lmove(wait_key, active_key, "LEFT", "RIGHT")

            if not job_id_bytes:
                # No jobs — wait briefly before polling again
                await asyncio.sleep(1.0)
                continue

            job_id = job_id_bytes.decode("utf-8").strip()

            # Fetch job data
            job_data_raw = await redis_client.hget(
                f"bull:{QUEUE_NAME}:{job_id}", "data"
            )
            if not job_data_raw:
                log.warning("job_data_missing", job_id=job_id)
                continue

            job_data = json.loads(job_data_raw)
            log.info("job_received", job_id=job_id)

            async def run_job(jid: str, data: dict) -> None:
                async with semaphore:
                    try:
                        await process_job(data, api_client)
                        # Mark as completed
                        await redis_client.lrem(active_key, 1, jid)
                        await redis_client.lpush(f"bull:{QUEUE_NAME}:completed", jid)
                        log.info("job_completed", job_id=jid)
                    except Exception as exc:
                        log.error("job_failed", job_id=jid, error=str(exc))
                        await redis_client.lrem(active_key, 1, jid)
                        await redis_client.lpush(f"bull:{QUEUE_NAME}:failed", jid)

            task = asyncio.create_task(run_job(job_id, job_data))
            tasks.add(task)
            task.add_done_callback(tasks.discard)

        except aioredis.RedisError as e:
            log.error("redis_error", error=str(e))
            await asyncio.sleep(5.0)
        except Exception as e:
            log.error("consumer_error", error=str(e))
            await asyncio.sleep(1.0)

    # Wait for active tasks to finish
    if tasks:
        log.info("waiting_for_active_jobs", count=len(tasks))
        await asyncio.gather(*tasks, return_exceptions=True)

    log.info("scraper_worker_stopped")


async def main() -> None:
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Clean stale temp files from previous crashed workers
    if os.path.isdir(settings.temp_dir):
        import glob
        stale = glob.glob(os.path.join(settings.temp_dir, "tmp*"))
        for f in stale:
            try:
                os.unlink(f)
                log.info("stale_temp_removed", path=f)
            except Exception:
                pass
    os.makedirs(settings.temp_dir, exist_ok=True)

    redis_client = aioredis.from_url(
        settings.redis_url, encoding="utf-8", decode_responses=False
    )

    headers = {}
    if settings.api_service_token:
        headers["Authorization"] = f"Bearer {settings.api_service_token}"

    async with httpx.AsyncClient(
        base_url=settings.api_base_url,
        headers=headers,
        timeout=30.0,
    ) as api_client:
        try:
            await consume_jobs(redis_client, api_client)
        finally:
            await redis_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
