from app.spiders.http_spider import is_private_address


async def test_blocks_loopback():
    assert await is_private_address("http://127.0.0.1/x") is True
    assert await is_private_address("http://localhost/x") is True


async def test_blocks_private_ip_ranges():
    assert await is_private_address("http://10.0.0.5/x") is True
    assert await is_private_address("http://192.168.1.1/x") is True
    assert await is_private_address("http://172.16.0.1/x") is True


async def test_blocks_link_local():
    assert await is_private_address("http://169.254.169.254/x") is True


async def test_blocks_cloud_metadata_hostname():
    assert await is_private_address("http://metadata.google.internal/x") is True


async def test_blocks_unspecified_address():
    assert await is_private_address("http://0.0.0.0/x") is True


async def test_allows_public_ip_literal():
    assert await is_private_address("http://93.184.216.34/x") is False  # example.com's old IP


async def test_does_not_false_positive_on_hostnames_that_merely_look_like_private_ip_prefixes():
    # "10.example.com" is a real public hostname, not the private range
    # 10.0.0.0/8 — a naive `hostname.startswith("10.")` check (the old,
    # buggy implementation) would incorrectly block it.
    import app.spiders.http_spider as http_spider

    async def fake_getaddrinfo(host, port):
        return [(None, None, None, None, ("93.184.216.34", 0))]

    class FakeLoop:
        getaddrinfo = staticmethod(fake_getaddrinfo)

    orig = http_spider.asyncio.get_running_loop
    http_spider.asyncio.get_running_loop = lambda: FakeLoop()
    try:
        assert await is_private_address("http://10.example.com/x") is False
    finally:
        http_spider.asyncio.get_running_loop = orig


async def test_catches_dns_rebinding_to_a_private_ip():
    # The core of the fix: a hostname that *resolves* to a private/loopback
    # address must be blocked even though the hostname string itself gives
    # no indication of that.
    import app.spiders.http_spider as http_spider

    async def fake_getaddrinfo(host, port):
        return [(None, None, None, None, ("127.0.0.1", 0))]

    class FakeLoop:
        getaddrinfo = staticmethod(fake_getaddrinfo)

    orig = http_spider.asyncio.get_running_loop
    http_spider.asyncio.get_running_loop = lambda: FakeLoop()
    try:
        assert await is_private_address("http://attacker-controlled.example/x") is True
    finally:
        http_spider.asyncio.get_running_loop = orig


async def test_fails_closed_when_dns_resolution_fails():
    import socket
    import app.spiders.http_spider as http_spider

    async def failing_getaddrinfo(host, port):
        raise socket.gaierror("simulated DNS failure")

    class FakeLoop:
        getaddrinfo = staticmethod(failing_getaddrinfo)

    orig = http_spider.asyncio.get_running_loop
    http_spider.asyncio.get_running_loop = lambda: FakeLoop()
    try:
        assert await is_private_address("http://does-not-resolve.invalid/x") is True
    finally:
        http_spider.asyncio.get_running_loop = orig
