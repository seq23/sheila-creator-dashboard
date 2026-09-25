// Research Brief truth rules (BUILD_PLAN.md section 6), in one place so the job result, a
// hand edit and the page all obey the same rule:
//   * every claim links its source(s);
//   * each claim is labelled her data, web or upload;
//   * weak or conflicting evidence is marked "uncertain";
//   * nothing uncited appears as fact.
// The Worker runs `enforceTruth` on every brief it stores and every brief it returns, so the
// page only has to read `claim.confidence` and `claim.basis`.
import { PLATFORMS, type Platform } from "@shared/constants";
import type { BriefBody, BriefSource, Claim } from "@shared/types";

/** Section 10b sources: the posting baseline every first brief starts from. */
export const BASELINE_SOURCES: BriefSource[] = [
  { id: "b_buffer_all", url: "https://buffer.com/resources/best-time-to-post-social-media/", title: "Buffer: best times to post, all platforms", kind: "web" },
  { id: "b_buffer_ig", url: "https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/", title: "Buffer: best time to post on Instagram (9.6M posts)", kind: "web" },
  { id: "b_sprout_tt", url: "https://sproutsocial.com/insights/best-times-to-post-on-tiktok/", title: "Sprout Social: best times to post on TikTok", kind: "web" },
  { id: "b_sprout_ig", url: "https://sproutsocial.com/insights/best-times-to-post-on-instagram/", title: "Sprout Social: best times to post on Instagram", kind: "web" },
  { id: "b_buffer_tt_freq", url: "https://buffer.com/resources/how-often-should-you-post-on-tiktok/", title: "Buffer: how often to post on TikTok (11.4M posts)", kind: "web" },
  { id: "b_buffer_freq", url: "https://buffer.com/resources/social-media-frequency-guide/", title: "Buffer: social media frequency guide", kind: "web" },
];

/** Marker source: present when web search was skipped (Firecrawl not connected). */
export const WEB_SKIPPED_SOURCE_ID = "web_skipped";

export type ClaimLabel = "her_data" | "web" | "upload" | "uncertain";

const BASES = new Set(["her_data", "web", "upload"]);

function isClaim(x: unknown): x is Claim {
  if (!x || typeof x !== "object") return false;
  const c = x as Record<string, unknown>;
  return typeof c.text === "string" && Array.isArray(c.source_ids) && c.source_ids.every((s) => typeof s === "string") && BASES.has(String(c.basis)) && (c.confidence === "solid" || c.confidence === "uncertain");
}

/** Every claim in a brief, with a path for error messages. */
export function allClaims(body: BriefBody): { path: string; claim: Claim }[] {
  const out: { path: string; claim: Claim }[] = [];
  body.audience.forEach((claim, i) => out.push({ path: `audience[${i}]`, claim }));
  body.themes.forEach((t, i) => t.claims.forEach((claim, j) => out.push({ path: `themes[${i}].claims[${j}]`, claim })));
  body.hooks.forEach((claim, i) => out.push({ path: `hooks[${i}]`, claim }));
  body.cut_styles.forEach((claim, i) => out.push({ path: `cut_styles[${i}]`, claim }));
  for (const p of PLATFORMS) (body.best_times[p] ?? []).forEach((s, i) => out.push({ path: `best_times.${p}[${i}]`, claim: s.claim }));
  body.comparable_creators.forEach((c, i) => out.push({ path: `comparable_creators[${i}].why`, claim: c.why }));
  body.shot_list.forEach((claim, i) => out.push({ path: `shot_list[${i}]`, claim }));
  return out;
}

/** Structural check: the body matches shared/types.ts BriefBody exactly enough to render. */
export function shapeProblems(x: unknown): string[] {
  const p: string[] = [];
  if (!x || typeof x !== "object") return ["brief is not an object"];
  const b = x as Record<string, unknown>;
  const claimList = (key: string) => {
    const v = b[key];
    if (!Array.isArray(v)) p.push(`${key} is not a list`);
    else v.forEach((c, i) => (isClaim(c) ? undefined : p.push(`${key}[${i}] is not a claim`)));
  };
  claimList("audience");
  claimList("hooks");
  claimList("cut_styles");
  claimList("shot_list");
  if (!Array.isArray(b.themes)) p.push("themes is not a list");
  else
    b.themes.forEach((t, i) => {
      const tt = t as Record<string, unknown>;
      if (typeof tt?.title !== "string") p.push(`themes[${i}].title missing`);
      if (!Array.isArray(tt?.claims) || !tt.claims.every(isClaim)) p.push(`themes[${i}].claims invalid`);
    });
  const bt = b.best_times as Record<string, unknown> | undefined;
  if (!bt || typeof bt !== "object") p.push("best_times missing");
  else
    for (const pl of PLATFORMS) {
      const slots = bt[pl];
      if (!Array.isArray(slots)) {
        p.push(`best_times.${pl} is not a list`);
        continue;
      }
      slots.forEach((s, i) => {
        const ss = s as Record<string, unknown>;
        const okNum = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
        if (!okNum(ss?.day, 0, 6) || !okNum(ss?.hour, 0, 23) || !okNum(ss?.minute, 0, 59)) p.push(`best_times.${pl}[${i}] has a bad day/hour/minute`);
        if (!isClaim(ss?.claim)) p.push(`best_times.${pl}[${i}].claim invalid`);
      });
    }
  if (!Array.isArray(b.comparable_creators)) p.push("comparable_creators is not a list");
  else
    b.comparable_creators.forEach((c, i) => {
      const cc = c as Record<string, unknown>;
      if (typeof cc?.handle !== "string" || !PLATFORMS.includes(cc?.platform as Platform) || !isClaim(cc?.why)) p.push(`comparable_creators[${i}] invalid`);
    });
  return p;
}

export function sourceProblems(sources: unknown): string[] {
  if (!Array.isArray(sources)) return ["sources is not a list"];
  const p: string[] = [];
  const seen = new Set<string>();
  sources.forEach((s, i) => {
    const ss = s as Record<string, unknown>;
    if (typeof ss?.id !== "string" || !ss.id) p.push(`sources[${i}].id missing`);
    else if (seen.has(ss.id)) p.push(`sources[${i}].id '${ss.id}' repeats`);
    else seen.add(ss.id);
    if (typeof ss?.title !== "string") p.push(`sources[${i}].title missing`);
    if (!(ss?.url === null || typeof ss?.url === "string")) p.push(`sources[${i}].url invalid`);
    if (!BASES.has(String(ss?.kind))) p.push(`sources[${i}].kind invalid`);
  });
  return p;
}

/**
 * The truth rule as a checker: a claim stated as fact ("solid") must cite at least one source
 * that exists in the brief. Returns one problem per violating claim.
 */
export function truthProblems(body: BriefBody, sources: BriefSource[]): string[] {
  const ids = new Set(sources.filter((s) => s.id !== WEB_SKIPPED_SOURCE_ID).map((s) => s.id));
  const out: string[] = [];
  for (const { path, claim } of allClaims(body)) {
    const cited = claim.source_ids.filter((id) => ids.has(id));
    if (claim.confidence === "solid" && cited.length === 0) out.push(`${path}: stated as fact with no source`);
    const unknown = claim.source_ids.filter((id) => !ids.has(id));
    if (unknown.length) out.push(`${path}: cites unknown source ${unknown.join(", ")}`);
  }
  return out;
}

/**
 * Make a brief obey the truth rule: drop citations to sources that do not exist, and mark any
 * claim left without a source "uncertain". Never upgrades a claim. Pure; returns a copy.
 */
export function enforceTruth(body: BriefBody, sources: BriefSource[]): BriefBody {
  const ids = new Set(sources.filter((s) => s.id !== WEB_SKIPPED_SOURCE_ID).map((s) => s.id));
  const fix = (c: Claim): Claim => {
    const source_ids = c.source_ids.filter((id) => ids.has(id));
    return { text: c.text, basis: c.basis, source_ids, confidence: source_ids.length === 0 ? "uncertain" : c.confidence };
  };
  const best_times = {} as BriefBody["best_times"];
  for (const p of PLATFORMS) best_times[p] = (body.best_times?.[p] ?? []).map((s) => ({ day: s.day, hour: s.hour, minute: s.minute, claim: fix(s.claim) }));
  return {
    audience: body.audience.map(fix),
    themes: body.themes.map((t) => ({ title: t.title, claims: t.claims.map(fix) })),
    hooks: body.hooks.map(fix),
    cut_styles: body.cut_styles.map(fix),
    best_times,
    comparable_creators: body.comparable_creators.map((c) => ({ handle: c.handle, platform: c.platform, why: fix(c.why) })),
    shot_list: body.shot_list.map(fix),
  };
}

/** What the page shows next to a claim. Uncited or weak → "uncertain", never fact. */
export function claimLabel(claim: Claim, sources: BriefSource[]): ClaimLabel {
  const ids = new Set(sources.filter((s) => s.id !== WEB_SKIPPED_SOURCE_ID).map((s) => s.id));
  if (claim.confidence === "uncertain" || !claim.source_ids.some((id) => ids.has(id))) return "uncertain";
  return claim.basis;
}

/** Counts for the page header: how many claims, how many uncertain, how many sources. */
export function briefCounts(body: BriefBody, sources: BriefSource[]) {
  const claims = allClaims(body);
  return {
    claims: claims.length,
    uncertain: claims.filter((c) => claimLabel(c.claim, sources) === "uncertain").length,
    sources: sources.filter((s) => s.id !== WEB_SKIPPED_SOURCE_ID).length,
  };
}
