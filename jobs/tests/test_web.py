"""Web search + page reading (jobs/common.py Web): the free keyless path and the optional
Firecrawl path, against responses captured from the real services on 25-26 Sep 2026
(fixtures/). Run: python3 -m unittest discover -s jobs/tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

FIX = Path(__file__).parent / "fixtures"
DDG = (FIX / "ddg_results.html").read_text()
JINA_READ = (FIX / "jina_read_example.json").read_text()
JINA_401 = (FIX / "jina_search_401.json").read_text()
FIRECRAWL_SEARCH = json.dumps({"success": True, "data": [{"url": "https://brand.example/creators", "title": "Creators", "description": "Join our creator program"}]})
FIRECRAWL_SCRAPE = json.dumps({"success": True, "data": {"markdown": "# Work with us\npartnerships@brand.example", "links": ["https://brand.example/apply"]}})


class Router:
    """Stands in for common._http: answers by URL prefix and records every call."""

    def __init__(self, routes: dict[str, tuple[int, str]]) -> None:
        self.routes = routes
        self.calls: list[str] = []

    def __call__(self, url: str, data=None, headers=None, timeout: float = 45):
        self.calls.append(url)
        for prefix, answer in self.routes.items():
            if url.startswith(prefix):
                return answer
        return 0, ""


class FreePath(unittest.TestCase):
    def test_search_with_no_keys_uses_duckduckgo_and_decodes_the_real_links(self):
        r = Router({common.DDG_HTML_URL: (200, DDG)})
        with mock.patch.object(common, "_http", r):
            rows = common.Web().search("tablescape creator program", 3)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["url"], "https://www.maeandco.shop/shop/p/tablescape-styling")
        self.assertTrue(all(x["url"].startswith("https://") for x in rows))
        self.assertTrue(rows[0]["title"])
        self.assertFalse(any("firecrawl" in c or "s.jina.ai" in c for c in r.calls), "no key: no Firecrawl, no Jina search")

    def test_jina_search_without_a_working_key_is_skipped_for_duckduckgo(self):
        r = Router({common.JINA_SEARCH_URL: (401, JINA_401), common.DDG_HTML_URL: (200, DDG)})
        with mock.patch.object(common, "_http", r):
            web = common.Web(jina_key="expired")
            rows = web.search("hosting", 2)
        self.assertEqual(len(rows), 2)
        self.assertEqual(web.used, {"jina_search": 1, "duckduckgo": 1})

    def test_read_uses_the_keyless_jina_reader(self):
        r = Router({common.JINA_READ_URL: (200, JINA_READ)})
        with mock.patch.object(common, "_http", r):
            text = common.Web().read("https://example.com")
        self.assertIn("This domain is for use in documentation examples", text)
        self.assertEqual(r.calls, [f"{common.JINA_READ_URL}https://example.com"])

    def test_read_falls_back_to_a_plain_fetch_with_tags_stripped(self):
        page = '<html><head><style>x{}</style><script>bad()</script></head><body><h1>Work with us</h1><p>Email <a href="https://brand.example/apply">apply</a></p></body></html>'
        r = Router({common.JINA_READ_URL: (429, ""), "https://brand.example": (200, page)})
        with mock.patch.object(common, "_http", r):
            text = common.Web().read("https://brand.example/creators")
        self.assertIn("Work with us", text)
        self.assertIn("https://brand.example/apply", text)
        self.assertNotIn("bad()", text)
        self.assertNotIn("<h1>", text)

    def test_a_blocked_search_returns_nothing_rather_than_inventing(self):
        r = Router({common.DDG_HTML_URL: (202, "<html>anomaly</html>")})
        with mock.patch.object(common, "_http", r):
            self.assertEqual(common.Web().search("anything"), [])


class FirecrawlPath(unittest.TestCase):
    def test_a_connected_key_is_used_first(self):
        r = Router({f"{common.FIRECRAWL_URL}/search": (200, FIRECRAWL_SEARCH), f"{common.FIRECRAWL_URL}/scrape": (200, FIRECRAWL_SCRAPE)})
        with mock.patch.object(common, "_http", r):
            web = common.Web(firecrawl_key="fc-good")
            rows = web.search("q")
            text = web.read("https://brand.example/creators")
        self.assertEqual(rows[0]["url"], "https://brand.example/creators")
        self.assertIn("partnerships@brand.example", text)
        self.assertEqual(web.used, {"firecrawl": 2})

    def test_out_of_credits_falls_through_to_the_free_path_and_is_remembered(self):
        r = Router({f"{common.FIRECRAWL_URL}": (402, ""), common.DDG_HTML_URL: (200, DDG), common.JINA_READ_URL: (200, JINA_READ)})
        with mock.patch.object(common, "_http", r):
            web = common.Web(firecrawl_key="fc-empty")
            self.assertEqual(len(web.search("q", 2)), 2)
            self.assertIn("documentation examples", web.read("https://example.com"))
            web.search("again", 1)
        self.assertEqual(web.firecrawl_refused, "out_of_credits")
        self.assertEqual(sum(1 for c in r.calls if c.startswith(common.FIRECRAWL_URL)), 1, "a refused key is not asked again")

    def test_a_refused_key_is_named(self):
        r = Router({f"{common.FIRECRAWL_URL}": (401, ""), common.DDG_HTML_URL: (200, DDG)})
        with mock.patch.object(common, "_http", r):
            web = common.Web(firecrawl_key="fc-bad")
            web.search("q")
        self.assertEqual(web.firecrawl_refused, "key_invalid")


if __name__ == "__main__":
    unittest.main()
