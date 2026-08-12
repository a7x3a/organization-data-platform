"""
A controlled local test website — spec §29/§37 explicitly require this
instead of crawling real external sites. Serves a fixed set of fixtures:
an HTML page with links, two PDFs with identical content (the duplicate
case), and one page that returns a non-200 status (the invalid-link case).
"""
import http.server
import socketserver
import threading

import pytest

DUPLICATE_CONTENT = b"%PDF-1.4 identical content, different URLs\n"
UNIQUE_CONTENT = b"%PDF-1.4 unique content\n"

FIXTURES = {
    "/index.html": (
        b"""<html><body>
        <a href="/docs/report-a.pdf">Report A</a>
        <a href="/docs/report-b.pdf">Report B (duplicate content)</a>
        <a href="/docs/unique.pdf">Unique report</a>
        <a href="/page2.html">Page 2</a>
        </body></html>""",
        "text/html",
    ),
    "/page2.html": (
        b'<html><body><a href="/docs/from-page2.pdf">Another doc</a></body></html>',
        "text/html",
    ),
    "/docs/report-a.pdf": (DUPLICATE_CONTENT, "application/pdf"),
    "/docs/report-b.pdf": (DUPLICATE_CONTENT, "application/pdf"),  # same bytes, different URL
    "/docs/unique.pdf": (UNIQUE_CONTENT, "application/pdf"),
    "/docs/from-page2.pdf": (b"%PDF-1.4 reached via page2\n", "application/pdf"),
}


class FixtureHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in FIXTURES:
            body, content_type = FIXTURES[self.path]
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/missing.pdf":
            self.send_response(404)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # keep test output clean


@pytest.fixture
def test_website():
    """Starts the fixture server on an ephemeral local port for the test's duration."""
    server = socketserver.TCPServer(("127.0.0.1", 0), FixtureHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()
