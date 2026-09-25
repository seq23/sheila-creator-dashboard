// Weekly brand finder + public contact finder (section 12b.2–3). The job (jobs/brand_finder.py)
// reads its spec from here: her locked profile's themes, deal fit and off-limits list, the
// comparable creators from the approved brief, the brands she listed herself, the names we
// already have, and the keys she pasted (Firecrawl, OpenRouter, optional Hunter). It posts back
// brand cards with fit score, reasons, why-now, source links and contacts.
//
// applyResult is the gate the plan's rules hang on, whatever the job sends:
//   * off-limits brands are dropped (never suggested);
//   * contacts must be public business contacts with the page they were found on;
//   * a brand we already have is updated in place (her hide / save choice is kept).
import type { JobHandler } from "./registry";
import type { Env } from "../env";
import { log } from "../lib/log";
import { parseJson, recordEvent, setHealth } from "../lib/db";
import { newId, nowIso } from "../lib/ids";
import { getConnectionSecret, listConnections, markConnection } from "../lib/connections";
import { brandKey, clampFit, contactProblem, offLimitsTerms, violatesOffLimits, type ContactCandidate } from "../domain/brandfit";
import { lockedProfile, themeList } from "../routes/mediakit";
import type { BriefBody } from "@shared/types";

export interface FinderBrand {
  name: string;
  website: string | null;
  program_url: string | null;
  socials: Record<string, string>;
  categories: string[];
  fit_score: number;
  fit_reasons: string[];
  why_now: string | null;
  source_links: string[];
  origin: "finder" | "program_search" | "her_list";
  contacts: ContactCandidate[];
}

export interface FinderResult {
  brands: FinderBrand[];
  searches: number;
  hunter_lookups: number;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function urlOrNull(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Coerce whatever the job sent into the shape we store; drops anything malformed. */
export function normaliseBrand(raw: unknown): FinderBrand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 80);
  if (!name) return null;
  const list = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : []);
  const socials: Record<string, string> = {};
  if (r.socials && typeof r.socials === "object") {
    for (const [k, v] of Object.entries(r.socials as Record<string, unknown>)) {
      const u = urlOrNull(v);
      if (u && /^[a-z]{2,20}$/.test(k)) socials[k] = u;
    }
  }
  const contacts: ContactCandidate[] = Array.isArray(r.contacts)
    ? (r.contacts as unknown[])
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
        .filter((x): x is Record<string, unknown> => !!x)
        .map((x) => ({ kind: (x.kind as ContactCandidate["kind"]) ?? "role_email", value: str(x.value, 300) ?? "", found_on_url: urlOrNull(x.found_on_url) ?? "" }))
    : [];
  const origin = r.origin === "program_search" || r.origin === "her_list" ? r.origin : "finder";
  return {
    name,
    website: urlOrNull(r.website),
    program_url: urlOrNull(r.program_url),
    socials,
    categories: list(r.categories, 40, 8),
    fit_score: clampFit(r.fit_score),
    fit_reasons: list(r.fit_reasons, 200, 5),
    why_now: str(r.why_now, 200),
    source_links: (Array.isArray(r.source_links) ? r.source_links : []).map(urlOrNull).filter((x): x is string => !!x).slice(0, 8),
    origin,
    contacts,
  };
}

export async function applyFinderResult(env: Env, result: unknown): Promise<{ added: number; updated: number; offLimits: number; contactsRefused: number }> {
  const res = (result && typeof result === "object" ? result : {}) as Partial<FinderResult>;
  const brands = (Array.isArray(res.brands) ? res.brands : []).map(normaliseBrand).filter((b): b is FinderBrand => !!b);
  const profile = await lockedProfile(env);
  const terms = offLimitsTerms(profile?.off_limits);

  const { results: existing } = await env.DB.prepare("SELECT id, name, website, status FROM brands").all<{ id: string; name: string; website: string | null; status: string }>();
  const byKey = new Map(existing.map((b) => [brandKey(b), b]));
  let added = 0;
  let updated = 0;
  let offLimits = 0;
  let contactsRefused = 0;

  for (const b of brands) {
    if (violatesOffLimits(b, terms)) {
      offLimits++;
      continue;
    }
    const safe = b.contacts.filter((ct) => {
      const bad = contactProblem(ct);
      if (bad) contactsRefused++;
      return !bad;
    });
    const hit = byKey.get(brandKey(b));
    let id: string;
    if (hit) {
      id = hit.id;
      await env.DB.prepare(
        "UPDATE brands SET website = COALESCE(?, website), program_url = COALESCE(?, program_url), socials = ?, fit_score = ?, fit_reasons = ?, why_now = ?, source_links = ? WHERE id = ?",
      )
        .bind(b.website, b.program_url, JSON.stringify(b.socials), b.fit_score, JSON.stringify(b.fit_reasons), b.why_now, JSON.stringify(b.source_links), id)
        .run();
      updated++;
    } else {
      id = newId("brd");
      await env.DB.prepare(
        "INSERT INTO brands (id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested')",
      )
        .bind(id, b.name, b.website, b.program_url, JSON.stringify(b.socials), b.fit_score, JSON.stringify(b.fit_reasons), b.why_now, JSON.stringify(b.source_links), b.origin === "her_list" ? "finder" : b.origin)
        .run();
      byKey.set(brandKey(b), { id, name: b.name, website: b.website, status: "suggested" });
      added++;
    }
    const { results: have } = await env.DB.prepare("SELECT value FROM brand_contacts WHERE brand_id = ?").bind(id).all<{ value: string }>();
    const known = new Set(have.map((h) => h.value.toLowerCase()));
    for (const ct of safe) {
      if (known.has(ct.value.toLowerCase())) {
        await env.DB.prepare("UPDATE brand_contacts SET checked_at = ?, found_on_url = ? WHERE brand_id = ? AND lower(value) = ?").bind(nowIso(), ct.found_on_url, id, ct.value.toLowerCase()).run();
        continue;
      }
      await env.DB.prepare("INSERT INTO brand_contacts (id, brand_id, kind, value, found_on_url) VALUES (?, ?, ?, ?, ?)").bind(newId("bct"), id, ct.kind, ct.value, ct.found_on_url).run();
      known.add(ct.value.toLowerCase());
    }
  }
  return { added, updated, offLimits, contactsRefused };
}

export const brandFinderJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    const profile = await lockedProfile(env);
    const brief = await env.DB.prepare("SELECT body FROM research_briefs WHERE status = 'approved' ORDER BY version DESC LIMIT 1").first<{ body: string }>();
    const body = brief ? parseJson<Partial<BriefBody>>(brief.body, {}) : {};
    const { results: herList } = await env.DB.prepare("SELECT name, website FROM brands WHERE origin = 'her_list' AND status != 'hidden'").all<{ name: string; website: string | null }>();
    const { results: known } = await env.DB.prepare("SELECT name, website FROM brands").all<{ name: string; website: string | null }>();
    const conns = await listConnections(env);
    const hunter = conns.find((c) => c.service === "hunter");
    return {
      job_id: jobId,
      ref_id: refId,
      type: "brand_finder",
      themes: themeList(profile?.themes),
      audience: profile?.audience ?? "",
      deal_fit: profile?.deal_fit ?? "",
      off_limits: offLimitsTerms(profile?.off_limits),
      comparable_creators: (body.comparable_creators ?? []).map((c) => ({ handle: c.handle, platform: c.platform })).slice(0, 10),
      her_list: herList,
      known_brands: known.map((k) => brandKey(k)),
      max_brands: 12,
      // Keys she pasted in Connect accounts. The spec is fetched over a signed call and never logged.
      keys: {
        firecrawl: await getConnectionSecret(env, "firecrawl"),
        openrouter: await getConnectionSecret(env, "openrouter"),
        hunter: hunter?.status === "ok" ? await getConnectionSecret(env, "hunter") : null,
      },
      hunter_credits_left: (hunter?.meta.credits_left as number | undefined) ?? null,
    };
  },

  async applyResult(env, jobId, _refId, result) {
    const r = await applyFinderResult(env, result);
    const res = (result ?? {}) as Partial<FinderResult>;
    if (typeof res.hunter_lookups === "number" && res.hunter_lookups > 0) {
      const conns = await listConnections(env);
      const h = conns.find((c) => c.service === "hunter");
      const left = typeof h?.meta.credits_left === "number" ? Math.max(0, (h.meta.credits_left as number) - res.hunter_lookups) : null;
      if (h?.status === "ok" && left !== null) await markConnection(env, "hunter", "ok", null, { credits_left: left });
    }
    await setHealth(env.DB, "Brand finder", "green", `Last run found ${r.added} new, refreshed ${r.updated}`, null);
    await recordEvent(env.DB, "brand_finder.done", jobId, r);
    log.info("brand_finder.apply", r);
  },

  async onFailure(env, jobId, _refId, safeError) {
    await setHealth(env.DB, "Brand finder", "red", "The weekly brand search did not finish. It tries again next Monday, or press Find brands now.", "reconnect-firecrawl");
    await recordEvent(env.DB, "brand_finder.failed", jobId, { len: safeError.length });
    log.warn("brand_finder.failed", { len: safeError.length });
  },

  /** FAKE_SERVICES: 6–8 believable brand cards with public contacts and sources. */
  async fakeRun(env, _jobId, _refId, options) {
    const profile = await lockedProfile(env);
    const theme = themeList(profile?.themes)[0] ?? "everyday style";
    const brands = fakeBrands(theme);
    if (options.failure === "bad_contacts") brands[0].contacts.push({ kind: "role_email", value: "jane.doe@gmail.com", found_on_url: "https://example.org/" });
    return { brands, searches: 9, hunter_lookups: 0 } satisfies FinderResult;
  },
};

export function fakeBrands(theme: string): FinderBrand[] {
  const b = (
    name: string,
    host: string,
    fit: number,
    reasons: string[],
    why: string | null,
    contacts: ContactCandidate[],
    extra: Partial<FinderBrand> = {},
  ): FinderBrand => ({
    name,
    website: `https://${host}/`,
    program_url: null,
    socials: { tiktok: `https://www.tiktok.com/@${host.split(".")[0]}`, instagram: `https://www.instagram.com/${host.split(".")[0]}` },
    categories: [],
    fit_score: fit,
    fit_reasons: reasons,
    why_now: why,
    source_links: [`https://${host}/pages/creators`],
    origin: "finder",
    contacts,
    ...extra,
  });
  return [
    b(
      "Maison Lumière Candles",
      "maisonlumiere.example",
      0.92,
      [`Matches your "${theme}" theme`, "Sponsors creators your size", "Has an open creator program"],
      "Sponsored 3 creators in your niche this month",
      [
        { kind: "form", value: "https://maisonlumiere.example/pages/creators/apply", found_on_url: "https://maisonlumiere.example/pages/creators" },
        { kind: "role_email", value: "partnerships@maisonlumiere.example", found_on_url: "https://maisonlumiere.example/pages/contact" },
      ],
      { program_url: "https://maisonlumiere.example/pages/creators", origin: "program_search" },
    ),
    b(
      "Golden Hour Tableware",
      "goldenhourtable.example",
      0.87,
      ["Hosting and entertaining fit", "Audience overlap: women 30–55"],
      "Ran #ad posts with 2 creators from your research brief",
      [{ kind: "role_email", value: "collabs@goldenhourtable.example", found_on_url: "https://goldenhourtable.example/contact" }],
      { source_links: ["https://goldenhourtable.example/contact", "https://www.tiktok.com/@goldenhourtable"] },
    ),
    b(
      "Velvet & Vine Wraps",
      "velvetandvine.example",
      0.84,
      ["Gifting season fits your content calendar", "Affiliate program open"],
      "Affiliate program reopened this week",
      [{ kind: "form", value: "https://velvetandvine.example/affiliates", found_on_url: "https://velvetandvine.example/affiliates" }],
      { program_url: "https://velvetandvine.example/affiliates", origin: "program_search" },
    ),
    b(
      "Cedar & Salt Kitchen",
      "cedarandsalt.example",
      0.81,
      ["Cooking-for-guests videos match your themes"],
      null,
      [{ kind: "role_email", value: "pr@cedarandsalt.example", found_on_url: "https://cedarandsalt.example/press" }],
    ),
    b(
      "Aurelia Linen Co.",
      "aurelialinen.example",
      0.78,
      ["Table styling fit", "Brand tone matches your voice"],
      "Launched a new collection last week",
      [{ kind: "agency", value: "talent@brightline-agency.example", found_on_url: "https://aurelialinen.example/press" }],
    ),
    b(
      "Petal Post Florals",
      "petalpost.example",
      0.74,
      ["Floral styling appears in your top clips"],
      "Paid partnership posts with 4 lifestyle creators in September",
      [{ kind: "role_email", value: "creators@petalpost.example", found_on_url: "https://petalpost.example/creators" }],
    ),
    // Filtered out when "alcohol" is on her off-limits list: proves the rule in fake mode.
    b("Midnight Spirits Co.", "midnightspirits.example", 0.7, ["Party hosting fit"], null, [{ kind: "role_email", value: "partners@midnightspirits.example", found_on_url: "https://midnightspirits.example/contact" }], {
      categories: ["alcohol", "spirits"],
    }),
    b("Hearth & Honey Bakery", "hearthhoney.example", 0.69, ["Holiday baking fit"], null, [
      { kind: "role_email", value: "hello@hearthhoney.example", found_on_url: "https://hearthhoney.example/about" },
    ]),
  ];
}
