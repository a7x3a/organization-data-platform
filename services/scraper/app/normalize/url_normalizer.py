"""
Centralized URL normalization.

Every place that discovers, queues, or deduplicates a URL must go through
here — this is the single source of truth for what makes two URLs "the
same" during a crawl. Spiders should never do their own ad-hoc URL cleanup.
"""
from urllib.parse import (
    urljoin,
    urlparse,
    urlunparse,
    parse_qsl,
    urlencode,
)

# Query parameters that carry no identity — stripping them prevents the same
# page being queued/discovered multiple times under different campaign tags.
TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_name", "utm_reader",
    "gclid", "fbclid", "msclkid", "dclid", "yclid",
    "mc_cid", "mc_eid",
    "igshid", "ref", "ref_src", "ref_url",
    "_ga", "_gl",
}

DEFAULT_PORTS = {"http": 80, "https": 443}


def normalize_url(url: str, base_url: str | None = None) -> str | None:
    """
    Normalize a URL for consistent discovery/dedup.

    - Resolves relative URLs against base_url when given.
    - Lowercases scheme and host.
    - Drops default ports (http:80, https:443).
    - Drops the fragment.
    - Drops known tracking query parameters; sorts remaining ones.
    - Collapses a single trailing slash on non-root paths.

    Returns None for malformed URLs or unsupported schemes (anything other
    than http/https) — callers should treat None as "skip this URL".
    """
    if not url or not url.strip():
        return None

    candidate = url.strip()
    if base_url:
        try:
            candidate = urljoin(base_url, candidate)
        except ValueError:
            return None

    try:
        parsed = urlparse(candidate)
    except ValueError:
        return None

    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        return None

    if not parsed.hostname:
        return None

    host = parsed.hostname.lower()
    port = parsed.port
    if port and port != DEFAULT_PORTS.get(scheme):
        netloc = f"{host}:{port}"
    else:
        netloc = host

    path = parsed.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
        if not path:
            path = "/"

    query_pairs = [
        (k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS
    ]
    query = urlencode(sorted(query_pairs))

    normalized = urlunparse((scheme, netloc, path, "", query, ""))
    return normalized


def is_same_domain_or_subdomain(hostname: str, allowed_domain: str) -> bool:
    """True if hostname is exactly allowed_domain or a subdomain of it."""
    hostname = hostname.lower()
    allowed_domain = allowed_domain.lower()
    return hostname == allowed_domain or hostname.endswith(f".{allowed_domain}")
