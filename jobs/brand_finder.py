"""Weekly brand finder + public contact finder (section 12b.2-3).

Sources, in order of pitch strength:
  1. brands she listed herself (find their contact route);
  2. brands sponsoring the comparable creators from her approved Research Brief
     (Firecrawl search for "#ad" / "paid partnership" posts by each handle);
  3. brands with creator / ambassador / affiliate programs for her content themes.

Each brand gets a fit score with plain reasons, a "why now", source links, and contacts in
priority order: the program application form -> a partnerships / PR email published on the
brand's own site -> their agency contact if published. Hunter (optional, her own free key)
looks up role addresses only (type=generic) and keeps the page each one was found on.

Public business contacts only: every address must appear on a public page we can link to.
Nothing is guessed, no personal address is kept, no individual is scraped. The Worker
re-checks every contact and the off-limits list when the result comes back.

Logs: step names and counts only (common.log). No brand names, links or addresses.
"""
from __future__ import annotations

import json
import urllib.error
import os
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from common import Job, json_object_in, log, openrouter_content, run

FIRECRAWL = "https://api.firecrawl.dev/v1"
HUNTER = "https://api.hunter.io/v2/domain-search"
MODEL = "openrouter/free"

ROLE_WORDS = {
    "partnerships", "partnership", "partners", "partner", "collab", "collabs", "collaborations",
    "influencer", "influencers", "creators", "creator", "ambassadors", "ambassador", "affiliates",
    "affiliate", "sponsorships", "sponsorship", "pr", "press", "media", "marketing", "brand",
    "brands", "social", "hello", "hi", "info", "contact", "team", "talent", "business", "bookings",
}
FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com"}
EMAIL_RE = re.compile(r"[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PROGRAM_PATHS = ["/pages/creators", "/creators", "/pages/affiliates", "/affiliates", "/ambassadors", "/pages/ambassador", "/partnerships", "/collaborations", "/pages/contact", "/contact", "/press"]
FORM_HINT = re.compile(r"(apply|application|creator|ambassador|affiliate|influencer|partner)", re.I)


def is_role_email(addr: str) -> bool:
    m = re.fullmatch(r"([a-z0-9._+-]+)@([a-z0-9.-]+\.[a-z]{2,})", addr.strip().lower())
    if not m:
        return False
    local, domain = m.group(1).split("+")[0], m.group(2)
    if domain in FREE_MAIL:
        return False
    return any(p in ROLE_WORDS for p in re.split(r"[._-]", local))


class Firecrawl:
    def __init__(self, key: str) -> None:
        self.key = key
        self.calls = 0

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any] | None:
        self.calls += 1
        try:
            r = requests.post(f"{FIRECRAWL}{path}", json=body, headers={"Authorization": f"Bearer {self.key}"}, timeout=60)
        except requests.RequestException:
            log("firecrawl.error", kind="network")
            return None
        if r.status_code == 401:
            raise RuntimeError("firecrawl_key_invalid")
        if r.status_code == 402:
            raise RuntimeError("firecrawl_out_of_credits")
        if r.status_code >= 400:
            log("firecrawl.error", status=r.status_code)
            return None
        return r.json()

    def search(self, query: str, limit: int = 6) -> list[dict[str, Any]]:
        data = self._post("/search", {"query": query, "limit": limit})
        return list((data or {}).get("data") or [])

    def scrape(self, url: str) -> str:
        data = self._post("/scrape", {"url": url, "formats": ["markdown", "links"], "onlyMainContent": False})
        d = (data or {}).get("data") or {}
        links = d.get("links") or []
        return (d.get("markdown") or "") + "\n" + "\n".join(str(x) for x in links)


def llm(key: str | None, system: str, user: str) -> dict[str, Any] | None:
    if not key:
        return None
    try:
        text, _ = openrouter_content(key, {"model": MODEL, "max_tokens": 2400, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}, timeout=120, usable=json_object_in)
    except urllib.error.HTTPError as e:
        log("llm.error", status=e.code)
        return None
    except (urllib.error.URLError, TimeoutError, ValueError):
        log("llm.error", kind="network")
        return None
    try:
        return json.loads(text[text.index("{"): text.rindex("}") + 1])
    except (KeyError, ValueError, IndexError):
        log("llm.unparsed")
        return None


def host(url: str | None) -> str:
    if not url:
        return ""
    return urlparse(url if "://" in url else f"https://{url}").hostname or ""


def root_url(url: str) -> str:
    h = host(url)
    return f"https://{h}/" if h else ""


def find_contacts(fc: Firecrawl, website: str, program_url: str | None) -> list[dict[str, str]]:
    """Form -> role email on the brand's own site. Only what is published on a page we visited."""
    contacts: list[dict[str, str]] = []
    seen: set[str] = set()
    base = root_url(website)
    if not base:
        return contacts
    brand_host = host(base).removeprefix("www.")
    pages = ([program_url] if program_url else []) + [urljoin(base, p) for p in PROGRAM_PATHS]
    for page in pages[:6]:
        text = fc.scrape(page)
        if not text.strip():
            continue
        for link in re.findall(r"https?://[^\s)\"'>]+", text):
            if FORM_HINT.search(link) and host(link).removeprefix("www.").endswith(brand_host) and link not in seen and ("apply" in link.lower() or "form" in link.lower()):
                contacts.append({"kind": "form", "value": link, "found_on_url": page})
                seen.add(link)
                break
        for addr in EMAIL_RE.findall(text):
            a = addr.lower().rstrip(".")
            if a in seen or not is_role_email(a):
                continue
            kind = "role_email" if a.split("@")[1].endswith(brand_host) else "agency"
            contacts.append({"kind": kind, "value": a, "found_on_url": page})
            seen.add(a)
        if any(c["kind"] == "form" for c in contacts) and any(c["kind"] == "role_email" for c in contacts):
            break
    return contacts


def hunter_role_emails(key: str, domain: str) -> list[dict[str, str]]:
    try:
        r = requests.get(HUNTER, params={"domain": domain, "type": "generic", "limit": 5, "api_key": key}, timeout=30)
    except requests.RequestException:
        return []
    if r.status_code in (401, 403):
        raise RuntimeError("hunter_key_invalid")
    if r.status_code >= 400:
        log("hunter.error", status=r.status_code)
        return []
    out = []
    for e in (r.json().get("data") or {}).get("emails") or []:
        addr = (e.get("value") or "").lower()
        sources = e.get("sources") or []
        page = sources[0].get("uri") if sources else None
        if addr and page and is_role_email(addr):
            out.append({"kind": "role_email", "value": addr, "found_on_url": page})
    return out


def main(job: Job, spec: dict[str, Any]) -> dict[str, Any]:
    keys = spec.get("keys") or {}
    fc_key = keys.get("firecrawl") or os.environ.get("FIRECRAWL_API_KEY")
    or_key = keys.get("openrouter") or os.environ.get("OPENROUTER_API_KEY")
    hunter_key = keys.get("hunter")
    hunter_left = spec.get("hunter_credits_left")
    if not fc_key:
        raise RuntimeError("firecrawl_not_connected")
    fc = Firecrawl(fc_key)
    themes: list[str] = spec.get("themes") or []
    creators = spec.get("comparable_creators") or []
    her_list = spec.get("her_list") or []
    known = set(spec.get("known_brands") or [])
    max_brands = int(spec.get("max_brands") or 12)

    # 1-3: gather search results (titles, descriptions, urls only)
    hits: list[dict[str, Any]] = []
    job.progress("searching", 0, 3)
    for c in creators[:6]:
        handle = str(c.get("handle", "")).lstrip("@")
        if handle:
            for h in fc.search(f'"{handle}" ("#ad" OR "paid partnership" OR "sponsored")', 5):
                hits.append({"source": "sponsor", "creator": handle, "url": h.get("url"), "title": h.get("title"), "description": h.get("description")})
    job.progress("searching", 1, 3)
    for t in themes[:5]:
        for h in fc.search(f"{t} brand creator program OR ambassador program OR affiliate program", 6):
            hits.append({"source": "program", "theme": t, "url": h.get("url"), "title": h.get("title"), "description": h.get("description")})
    job.progress("searching", 2, 3)
    log("brand_finder.search", hits=len(hits), searches=fc.calls)

    system = (
        "You pick brands for a creator's brand deals. From the search results, list real brands (not creators, not agencies, "
        "not marketplaces) that sponsor creators or run creator/ambassador/affiliate programs. Never include anything matching "
        "the off-limits list. Score fit 0-100 against her themes and deal fit. Reasons are short plain sentences. why_now is one "
        "short sentence from the evidence or null. source_links are result urls that support the brand. Answer JSON: "
        '{"brands":[{"name","website","program_url","categories":[],"fit_score","fit_reasons":[],"why_now","source_links":[],"origin":"finder|program_search"}]}'
    )
    user = json.dumps({"themes": themes, "deal_fit": spec.get("deal_fit", ""), "audience": spec.get("audience", ""), "off_limits": spec.get("off_limits") or [], "results": hits[:60]})
    picked = (llm(or_key, system, user) or {}).get("brands") or []

    brands: list[dict[str, Any]] = []
    for b in her_list:
        brands.append({"name": b.get("name"), "website": b.get("website"), "program_url": None, "categories": [], "fit_score": 90, "fit_reasons": ["You use and love this brand."], "why_now": None, "source_links": [], "origin": "her_list", "socials": {}})
    for b in picked:
        if not isinstance(b, dict) or not b.get("name") or not b.get("website"):
            continue
        key = host(b.get("website")).removeprefix("www.") or str(b.get("name")).lower()
        if key in known:
            continue
        known.add(key)
        brands.append({**b, "socials": {}})
        if len(brands) >= max_brands + len(her_list):
            break

    # contacts: site first, Hunter only for brands still without an email
    hunter_used = 0
    for i, b in enumerate(brands):
        job.progress("contacts", i, len(brands))
        if not b.get("website"):
            b["contacts"] = []
            continue
        b["contacts"] = find_contacts(fc, b["website"], b.get("program_url"))
        has_email = any(c["kind"] in ("role_email", "agency") for c in b["contacts"])
        if not has_email and hunter_key and (hunter_left is None or hunter_left - hunter_used > 0):
            b["contacts"] += hunter_role_emails(hunter_key, host(b["website"]).removeprefix("www."))
            hunter_used += 1
        if b.get("program_url") and not any(c["kind"] == "form" for c in b["contacts"]):
            b["contacts"].insert(0, {"kind": "form", "value": b["program_url"], "found_on_url": b["program_url"]})
        if not b.get("source_links"):
            b["source_links"] = [c["found_on_url"] for c in b["contacts"]][:3]

    log("brand_finder.done", brands=len(brands), searches=fc.calls, hunter=hunter_used)
    return {"brands": brands, "searches": fc.calls, "hunter_lookups": hunter_used}


if __name__ == "__main__":
    run(main)
