from app.normalize.url_normalizer import normalize_url, is_same_domain_or_subdomain


class TestNormalizeUrl:
    def test_lowercases_scheme_and_host(self):
        assert normalize_url("HTTP://Example.COM/path") == "http://example.com/path"

    def test_preserves_path_case(self):
        # Paths are case-sensitive on most servers — only scheme/host are lowercased.
        assert normalize_url("https://example.com/Path/Here") == "https://example.com/Path/Here"

    def test_drops_default_http_port(self):
        assert normalize_url("http://example.com:80/x") == "http://example.com/x"

    def test_drops_default_https_port(self):
        assert normalize_url("https://example.com:443/x") == "https://example.com/x"

    def test_keeps_non_default_port(self):
        assert normalize_url("https://example.com:8443/x") == "https://example.com:8443/x"

    def test_drops_fragment(self):
        assert normalize_url("https://example.com/page#section") == "https://example.com/page"

    def test_strips_tracking_params(self):
        result = normalize_url("https://example.com/x?utm_source=news&id=5")
        assert result == "https://example.com/x?id=5"

    def test_sorts_remaining_query_params(self):
        result = normalize_url("https://example.com/x?b=2&a=1")
        assert result == "https://example.com/x?a=1&b=2"

    def test_collapses_trailing_slash_on_non_root_path(self):
        assert normalize_url("https://example.com/dir/") == "https://example.com/dir"

    def test_root_path_stays_slash(self):
        assert normalize_url("https://example.com") == "https://example.com/"
        assert normalize_url("https://example.com/") == "https://example.com/"

    def test_resolves_relative_url_against_base(self):
        result = normalize_url("/relative/path", base_url="https://example.com/base/page")
        assert result == "https://example.com/relative/path"

    def test_resolves_relative_link_against_base(self):
        result = normalize_url("next-page.html", base_url="https://example.com/dir/page.html")
        assert result == "https://example.com/dir/next-page.html"

    def test_rejects_non_http_scheme(self):
        assert normalize_url("ftp://example.com/file") is None
        assert normalize_url("javascript:void(0)") is None
        assert normalize_url("mailto:a@b.com") is None

    def test_rejects_empty_string(self):
        assert normalize_url("") is None
        assert normalize_url("   ") is None

    def test_rejects_malformed_url(self):
        assert normalize_url("not a url") is None

    def test_two_equivalent_urls_normalize_identically(self):
        # The core promise: dedup should treat these as the same page.
        a = normalize_url("HTTPS://Example.com:443/Docs/?utm_campaign=x&b=2&a=1#top")
        b = normalize_url("https://example.com/Docs?a=1&b=2")
        assert a == b


class TestIsSameDomainOrSubdomain:
    def test_exact_match(self):
        assert is_same_domain_or_subdomain("example.com", "example.com") is True

    def test_subdomain_match(self):
        assert is_same_domain_or_subdomain("blog.example.com", "example.com") is True

    def test_unrelated_domain_rejected(self):
        assert is_same_domain_or_subdomain("example.org", "example.com") is False

    def test_similar_suffix_not_treated_as_subdomain(self):
        # "evilexample.com" must not match "example.com"
        assert is_same_domain_or_subdomain("evilexample.com", "example.com") is False

    def test_case_insensitive(self):
        assert is_same_domain_or_subdomain("BLOG.EXAMPLE.COM", "example.com") is True
