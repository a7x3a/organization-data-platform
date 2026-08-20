"""
robots.txt fetching/enforcement, and Sitemap: directive discovery.

CrawlConfig.robots_enabled has existed since Phase 1 but was never actually
checked anywhere in the crawler — this module is what makes that flag real.
It doubles as the sitemap discovery entry point, since a site's robots.txt
is the canonical place it advertises its sitemap location(s).
"""
from __future__ import annotations

import urllib.robotparser
from urllib.parse import urlparse

import httpx
import structlog

log = structlog.get_logger(__name__)

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


class RobotsCache:
    """
    Per-crawl cache of one parsed robots.txt + sitemap list per domain —
    fetched at most once per domain per run, not once per URL checked.
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client
        self._parsers: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._sitemaps: dict[str, list[str]] = {}

    async def _load(self, domain: str) -> None:
        if domain in self._parsers:
            return

        parser = urllib.robotparser.RobotFileParser()
        sitemaps: list[str] = []
        try:
            resp = await self._client.get(
                f"https://{domain}/robots.txt",
                headers={"User-Agent": _USER_AGENT},
                timeout=10,
            )
            if resp.status_code == 200:
                text = resp.text
                # RobotFileParser.read() does its own blocking urlopen() —
                # parse() lets us feed in text fetched via the shared async
                # client instead, so this never stalls the crawl's event loop.
                parser.parse(text.splitlines())
                sitemaps = [
                    line.split(":", 1)[1].strip()
                    for line in text.splitlines()
                    if line.lower().startswith("sitemap:") and ":" in line[8:]
                ]
            else:
                # No robots.txt (404) or a server error — conventionally
                # treated as "no restrictions" by well-behaved crawlers,
                # same as most real-world crawlers do for a missing file.
                parser.parse([])
        except Exception as exc:
            log.debug("robots_fetch_failed", domain=domain, error=str(exc))
            parser.parse([])

        self._parsers[domain] = parser
        self._sitemaps[domain] = sitemaps

    async def is_allowed(self, url: str, *, enabled: bool) -> bool:
        """True if `url` may be fetched — always True when robots checking is off."""
        if not enabled:
            return True
        domain = urlparse(url).hostname or ""
        if not domain:
            return True
        await self._load(domain)
        try:
            return self._parsers[domain].can_fetch(_USER_AGENT, url)
        except Exception:
            return True

    async def sitemaps_for(self, url: str) -> list[str]:
        """
        Sitemap URLs advertised in `url`'s domain's robots.txt, falling back
        to the conventional /sitemap.xml path when none are advertised.
        """
        domain = urlparse(url).hostname or ""
        if not domain:
            return []
        await self._load(domain)
        sitemaps = list(self._sitemaps.get(domain, []))
        if not sitemaps:
            scheme = urlparse(url).scheme or "https"
            sitemaps = [f"{scheme}://{domain}/sitemap.xml"]
        return sitemaps
