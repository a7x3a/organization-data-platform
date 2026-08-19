import asyncio
import structlog
from playwright.async_api import Page

log = structlog.get_logger(__name__)

async def handle_cloudflare_challenge(page: Page, max_wait_seconds: int = 15) -> bool:
    """
    Detect and automatically solve Cloudflare Turnstile / Managed Challenge pages.
    
    If a Cloudflare challenge page ("Just a moment...", "Attention Required!", etc.)
    is encountered, this solver:
    1. Waits for automated JavaScript challenge execution.
    2. Scans frames for Cloudflare Turnstile checkboxes (#challenge-stage, iframe[src*='challenges.cloudflare.com']).
    3. Clicks the challenge interaction area if present.
    4. Waits for navigation/title change to complete.
    """
    try:
        title = await page.title()
    except Exception:
        return False

    if not any(token in title for token in ("Just a moment...", "Attention Required!", "Cloudflare", "Security Check")):
        return True

    log.info("cloudflare_challenge_detected", title=title, url=page.url)

    for i in range(max_wait_seconds):
        await asyncio.sleep(1.0)
        try:
            current_title = await page.title()
            if not any(token in current_title for token in ("Just a moment...", "Attention Required!", "Cloudflare", "Security Check")):
                log.info("cloudflare_challenge_passed", title=current_title, elapsed_seconds=i+1)
                return True

            # Scan page frames for Turnstile / Challenge iframe elements
            for frame in page.frames:
                frame_url = frame.url.lower()
                if "challenges.cloudflare.com" in frame_url or "turnstile" in frame_url or "challenge" in frame_url:
                    for selector in (
                        "input[type='checkbox']",
                        "#challenge-stage",
                        ".mark",
                        "label.ctp-checkbox-label",
                        "#challenge-form",
                        "body",
                    ):
                        try:
                            element = await frame.query_selector(selector)
                            if element:
                                is_visible = await element.is_visible()
                                if is_visible:
                                    await element.click(force=True)
                                    log.debug("cloudflare_turnstile_clicked", frame=frame_url, selector=selector)
                                    break
                        except Exception:
                            pass
        except Exception:
            pass

    final_title = await page.title()
    passed = not any(token in final_title for token in ("Just a moment...", "Attention Required!", "Cloudflare", "Security Check"))
    if passed:
        log.info("cloudflare_challenge_passed", title=final_title)
    else:
        log.warning("cloudflare_challenge_unsolved", title=final_title, url=page.url)
    return passed
