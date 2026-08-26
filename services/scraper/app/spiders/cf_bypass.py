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

            # 1. Click bounding box of any Cloudflare challenge iframe on the page
            cf_iframes = await page.query_selector_all("iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile'], #turnstile-wrapper iframe")
            for iframe in cf_iframes:
                try:
                    box = await iframe.bounding_box()
                    if box and box.get("width", 0) > 0:
                        click_x = box["x"] + min(30, box["width"] / 2)
                        click_y = box["y"] + box["height"] / 2
                        await page.mouse.click(click_x, click_y)
                        log.debug("cloudflare_turnstile_box_clicked", x=click_x, y=click_y)
                except Exception:
                    pass

            # 2. Scan frames for Turnstile / Challenge iframe elements
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
