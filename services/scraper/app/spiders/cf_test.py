import asyncio
from playwright.async_api import async_playwright

async def solve_cloudflare(page):
    title = await page.title()
    if "Just a moment..." in title or "Cloudflare" in title:
        for _ in range(12):
            await page.wait_for_timeout(1000)
            current_title = await page.title()
            if "Just a moment..." not in current_title and "Cloudflare" not in current_title:
                return True
            # Attempt to click Turnstile challenge iframe
            for frame in page.frames:
                if "challenges.cloudflare.com" in frame.url or "turnstile" in frame.url:
                    try:
                        box = await frame.query_selector("input[type='checkbox'], #challenge-stage, body")
                        if box:
                            await box.click()
                    except Exception:
                        pass
    return "Just a moment..." not in (await page.title())

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            "window.chrome = { runtime: {} };"
        )
        page = await context.new_page()
        res = await page.goto("https://www.kurdipedia.org/library.aspx", wait_until="domcontentloaded", timeout=30000)
        print("Initial Status:", res.status if res else "None")
        print("Initial Title:", await page.title())

        solved = await solve_cloudflare(page)
        print("Solved:", solved)
        print("Final Title:", await page.title())
        print("Final URL:", page.url)

        links = await page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
        valid_links = [l for l in links if "cloudflare" not in l]
        print("Valid Links Count:", len(valid_links))
        print("Sample Links:", valid_links[:10])

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
