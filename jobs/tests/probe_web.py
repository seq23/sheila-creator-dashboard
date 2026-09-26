"""TEMPORARY (removed before merge): which keyless search engines answer from a GitHub runner.
Logs engine, HTTP status and result count only."""
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

for q in ["tablescape brand creator program", "home decor brand ambassador program apply"]:
    qq = urllib.parse.quote_plus(q)
    s, b = common._http(f"{common.DDG_HTML_URL}?q={qq}")
    common.log("probe", engine="duckduckgo", status=s, n=len(common.parse_ddg_html(b, 6)))
    s, b = common._http(f"{common.DDG_LITE_URL}?q={qq}")
    common.log("probe", engine="duckduckgo_lite", status=s, n=len(common.parse_ddg_lite(b, 6)))
    s, b = common._http(f"{common.JINA_READ_URL}{common.DDG_HTML_URL}?q={qq}", None, {"Accept": "application/json"}, 60)
    common.log("probe", engine="jina_duckduckgo", status=s, n=len(common.parse_jina_ddg(b, 6)))
    s, b = common._http(f"{common.JINA_READ_URL}https://example.com", None, {"Accept": "application/json"})
    common.log("probe", engine="jina_read", status=s, n=len(b))
    rows = common.Web().search(q, 6)
    common.log("probe", engine="chain", n=len(rows))
