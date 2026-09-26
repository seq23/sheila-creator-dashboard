// Cut a dump into clips (section 8). OWNED BY: phase 4 (Editing engine).
//
// buildSpec   → everything jobs/cut.py needs: the dump, its uploaded videos (R2 keys, notes,
//               recycle fields), the locked Brand Profile, the approved brief, the caps and
//               the recipe bounds. Door B applies the 90-day cooldown and "best past
//               performers first" here, so the job never has to know the rules.
// applyResult → validates the job's clip list (parseCutResult), inserts the clips in one
//               batch, flips the dump to "ready" and sends the "Clips ready" email.
// onFailure   → the dump goes to "failed" with a plain sentence she can act on.
// fakeRun     → FAKE_SERVICES=1: 6–12 realistic clips per dump, with tiny real MP4/JPEG
//               objects written to R2 so Review's player and covers work locally.
import type { JobHandler } from "./registry";
import type { Env } from "../env";
import { log } from "../lib/log";
import { parseJson, recordEvent } from "../lib/db";
import { clipCuttingLight } from "../crons/buffer-sync";
import { mediaToken, newId, nowIso } from "../lib/ids";
import { unb64 } from "../lib/crypto";
import { emailFrame, sendEmail } from "../services/email";
import { readSettings } from "../routes/settings";
import { weeklyNeed } from "../domain/runway";
import { rankRecycle, recyclePlatforms, type PriorPost } from "../domain/cooldown";
import { PLATFORMS, QUALITY_BAR, RECIPES, type Platform, type Recipe } from "@shared/constants";

// ---------------------------------------------------------------- spec

export interface CutSpecAsset {
  id: string;
  r2_key: string;
  mime_type: string;
  duration_s: number | null;
  file_note: string | null;
  original_platform: string | null;
  original_posted_at: string | null;
  original_views: number | null;
  /** Platforms this asset's clips may go to (Door B: outside the cooldown). */
  allowed_platforms: Platform[];
}

export interface CutSpec {
  job_id: string;
  type: "cut";
  dump_id: string;
  door: "new" | "recycle";
  notes: string;
  assets: CutSpecAsset[];
  skipped_assets: { id: string; reason: "cooldown" | "identical_file" }[];
  brand_profile: Record<string, string> | null;
  brief: unknown;
  weekly_caps: Record<Platform, number>;
  weekly_need: number;
  /** Candidates to make: 2–3× the weekly need, ranked, the rest hidden. */
  target_clips: { min: number; max: number };
  recipes: Record<Recipe, { minS: number; maxS: number }>;
  quality_bar: number;
  output_prefix: string;
}

/** Platforms a recycled asset may go to: the cooldown per platform from its known past post. */
export function allowedPlatformsFor(asset: { original_platform: string | null; original_posted_at: string | null }, priors: PriorPost[], door: "new" | "recycle", now: Date, cooldownDays: number): Platform[] {
  if (door === "new") return [...PLATFORMS];
  const prior = [...priors];
  const p = asset.original_platform as Platform | null;
  if (p && (PLATFORMS as readonly string[]).includes(p)) {
    // Unknown date on a known platform: treat it as recent (safer to wait than to look reposted).
    prior.push({ platform: p, posted_at: asset.original_posted_at ? new Date(asset.original_posted_at).toISOString() : now.toISOString() });
  }
  return recyclePlatforms(prior, [...PLATFORMS], now, cooldownDays);
}

export function targetClips(need: number): { min: number; max: number } {
  const n = Math.max(1, need);
  return { min: n * 2, max: n * 3 };
}

interface AssetDb {
  id: string;
  r2_key: string;
  mime_type: string;
  duration_s: number | null;
  file_note: string | null;
  original_platform: string | null;
  original_posted_at: string | null;
  original_views: number | null;
  content_hash: string | null;
}

async function buildSpec(env: Env, jobId: string, dumpId: string | null): Promise<CutSpec> {
  if (!dumpId) throw new Error("cut job has no dump");
  const dump = await env.DB.prepare("SELECT id, door, notes FROM dumps WHERE id = ?").bind(dumpId).first<{ id: string; door: "new" | "recycle"; notes: string }>();
  if (!dump) throw new Error("dump missing");
  const { results: rows } = await env.DB.prepare(
    "SELECT id, r2_key, mime_type, duration_s, file_note, original_platform, original_posted_at, original_views, content_hash FROM assets WHERE dump_id = ? AND upload_status = 'uploaded' AND raw_deleted_at IS NULL ORDER BY created_at",
  )
    .bind(dumpId)
    .all<AssetDb>();
  const s = await readSettings(env);
  const now = new Date();
  const skipped: CutSpec["skipped_assets"] = [];
  const assets: CutSpecAsset[] = [];
  const ordered = dump.door === "recycle" ? rankRecycle(rows) : rows;
  for (const a of ordered) {
    let priors: PriorPost[] = [];
    if (a.content_hash) {
      // Never the identical file: a byte-identical video from another dump that already made clips is skipped.
      const twin = await env.DB.prepare("SELECT a.id FROM assets a WHERE a.content_hash = ? AND a.id != ? AND EXISTS (SELECT 1 FROM clips c WHERE c.asset_id = a.id AND c.status != 'deleted') LIMIT 1")
        .bind(a.content_hash, a.id)
        .first();
      if (twin) {
        skipped.push({ id: a.id, reason: "identical_file" });
        continue;
      }
      const { results: posted } = await env.DB.prepare(
        "SELECT p.platform, p.posted_at FROM posts p JOIN clips c ON c.id = p.clip_id JOIN assets a ON a.id = c.asset_id WHERE a.content_hash = ? AND p.status = 'posted' AND p.posted_at IS NOT NULL",
      )
        .bind(a.content_hash)
        .all<PriorPost>();
      priors = posted;
    }
    const allowed = allowedPlatformsFor(a, priors, dump.door, now, s.recycle_cooldown_days);
    if (!allowed.length) {
      skipped.push({ id: a.id, reason: "cooldown" });
      continue;
    }
    assets.push({
      id: a.id,
      r2_key: a.r2_key,
      mime_type: a.mime_type,
      duration_s: a.duration_s,
      file_note: a.file_note,
      original_platform: a.original_platform,
      original_posted_at: a.original_posted_at,
      original_views: a.original_views,
      allowed_platforms: allowed,
    });
  }
  const profile = await env.DB.prepare("SELECT sections FROM brand_profile WHERE locked = 1 ORDER BY version DESC LIMIT 1").first<{ sections: string }>();
  const brief = await env.DB.prepare("SELECT body FROM research_briefs WHERE status = 'approved' ORDER BY version DESC LIMIT 1").first<{ body: string }>();
  const need = weeklyNeed(s.weekly_caps);
  const recipes = Object.fromEntries(Object.entries(RECIPES).map(([k, v]) => [k, { minS: v.minS, maxS: v.maxS }])) as CutSpec["recipes"];
  return {
    job_id: jobId,
    type: "cut",
    dump_id: dump.id,
    door: dump.door,
    notes: dump.notes,
    assets,
    skipped_assets: skipped,
    brand_profile: profile ? parseJson<Record<string, string>>(profile.sections, {}) : null,
    brief: brief ? parseJson<unknown>(brief.body, null) : null,
    weekly_caps: s.weekly_caps,
    weekly_need: need,
    target_clips: targetClips(need),
    recipes,
    quality_bar: QUALITY_BAR,
    output_prefix: `clips/${dump.id}/`,
  };
}

// ---------------------------------------------------------------- result

/** One clip as jobs/cut.py reports it. */
export interface CutResultClip {
  id: string;
  asset_id: string;
  start_s: number;
  end_s: number;
  recipe: Recipe;
  hook_text: string;
  hook_alt: string | null;
  caption: string;
  hashtags: string | string[];
  platforms: Platform[];
  score: number;
  r2_key: string;
  cover_r2_key: string | null;
}

export interface CutResult {
  clips: CutResultClip[];
  /** Which tools actually ran, so "clips look wrong" can be traced. */
  engine?: { transcript?: string; picker?: string; crop?: string; subtitles?: string };
  skipped?: { asset_id: string; reason: string }[];
  /** Measured source lengths; stored on assets.duration_s. */
  assets?: { id: string; duration_s: number }[];
}

export interface CleanClip {
  id: string;
  asset_id: string;
  start_s: number;
  end_s: number;
  recipe: Recipe;
  hook_text: string;
  hook_alt: string | null;
  caption: string;
  hashtags: string;
  platforms: Platform[];
  score: number;
  hidden: boolean;
  r2_key: string;
  cover_r2_key: string | null;
}

export class CutResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CutResultError";
  }
}

export const MAX_CLIPS_PER_DUMP = 60;
const MIN_CLIP_S = 3;
const LENGTH_SLACK_S = 1;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function normalizeHashtags(v: unknown): string {
  const parts = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\s,]+/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const t = raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(`#${t}`);
    if (out.length >= 15) break;
  }
  return out.join(" ");
}

/**
 * The Worker never trusts the job: every clip is checked against the dump it belongs to.
 * Throws CutResultError (a content-free message) when the whole result is unusable; drops
 * single clips that break a rule and reports how many were dropped.
 */
export function parseCutResult(
  result: unknown,
  ctx: { dumpId: string; allowed: Map<string, Platform[]>; rawKeys: Set<string> },
): { clips: CleanClip[]; dropped: number } {
  if (!result || typeof result !== "object" || !Array.isArray((result as CutResult).clips)) throw new CutResultError("result has no clip list");
  const list = (result as CutResult).clips;
  if (list.length > MAX_CLIPS_PER_DUMP) throw new CutResultError("too many clips");
  const prefix = `clips/${ctx.dumpId}/`;
  const ids = new Set<string>();
  const clips: CleanClip[] = [];
  let dropped = 0;
  for (const raw of list as unknown[]) {
    const c = (raw ?? {}) as Partial<CutResultClip>;
    const recipe = c.recipe as Recipe;
    const bounds = RECIPES[recipe];
    const start = Number(c.start_s);
    const end = Number(c.end_s);
    const score = Number(c.score);
    const allowed = ctx.allowed.get(String(c.asset_id));
    const ok =
      typeof c.id === "string" &&
      /^clp_[a-z0-9]{8,32}$/.test(c.id) &&
      !ids.has(c.id) &&
      !!allowed &&
      !!bounds &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end - start >= MIN_CLIP_S &&
      end - start <= bounds.maxS + LENGTH_SLACK_S &&
      Number.isFinite(score) &&
      typeof c.r2_key === "string" &&
      c.r2_key.startsWith(prefix) &&
      c.r2_key.endsWith(".mp4") &&
      !ctx.rawKeys.has(c.r2_key) &&
      (c.cover_r2_key == null || (typeof c.cover_r2_key === "string" && c.cover_r2_key.startsWith(prefix) && c.cover_r2_key.endsWith(".jpg"))) &&
      str(c.hook_text, 200).length > 0;
    if (!ok) {
      dropped++;
      continue;
    }
    // Door B cooldown is re-applied here: a platform the spec did not allow is unticked.
    const wanted = Array.isArray(c.platforms) && c.platforms.length ? c.platforms : [...PLATFORMS];
    const platforms = PLATFORMS.filter((p) => wanted.includes(p) && allowed!.includes(p));
    if (!platforms.length) {
      dropped++;
      continue;
    }
    ids.add(c.id!);
    const s = Math.max(0, Math.min(1, score));
    const alt = str(c.hook_alt, 200);
    clips.push({
      id: c.id!,
      asset_id: String(c.asset_id),
      start_s: Math.round(start * 100) / 100,
      end_s: Math.round(end * 100) / 100,
      recipe,
      hook_text: str(c.hook_text, 200),
      hook_alt: alt || null,
      caption: str(c.caption, 2200),
      hashtags: normalizeHashtags(c.hashtags),
      platforms,
      score: Math.round(s * 1000) / 1000,
      hidden: s < QUALITY_BAR,
      r2_key: c.r2_key!,
      cover_r2_key: c.cover_r2_key ?? null,
    });
  }
  return { clips, dropped };
}

/** Plain sentences for the Dump screen when cutting fails. Never echoes the raw error. */
export function plainFailure(safeError: string): string {
  const e = safeError.toLowerCase();
  if (e.includes("no usable") || e.includes("no clips") || e.includes("nousable")) return "We couldn't find any usable moments in these videos. Try longer takes with talking or action, then dump again.";
  if (e.includes("download") || e.includes("nosuchkey") || e.includes("clienterror")) return "We couldn't open your videos. Try dumping them again.";
  if (e.includes("ffmpeg") || e.includes("calledprocesserror") || e.includes("decode")) return "One of the videos couldn't be read. It may be damaged or in an unusual format. Try exporting it again from your phone.";
  if (e.includes("timeout") || e.includes("cancel")) return "Cutting took too long and stopped. Try dumping fewer or shorter videos at a time.";
  if (e.includes("result") || e.includes("clip list") || e.includes("too many clips")) return "The cutter sent back something we couldn't use. Dump the videos again; if it happens twice, tell your helper.";
  return "Cutting stopped partway. Dump the videos again; if it happens twice, tell your helper.";
}

async function applyResult(env: Env, jobId: string, dumpId: string | null, result: unknown): Promise<void> {
  if (!dumpId) throw new CutResultError("cut job has no dump");
  const dump = await env.DB.prepare("SELECT id, door FROM dumps WHERE id = ?").bind(dumpId).first<{ id: string; door: "new" | "recycle" }>();
  if (!dump) throw new CutResultError("dump missing");
  // The allowed platforms are recomputed from the database, not taken from the job.
  const spec = await buildSpec(env, jobId, dumpId);
  const allowed = new Map(spec.assets.map((a) => [a.id, a.allowed_platforms]));
  const rawKeys = new Set(spec.assets.map((a) => a.r2_key));
  const { clips, dropped } = parseCutResult(result, { dumpId, allowed, rawKeys });
  if (!clips.length) throw new CutResultError("no usable clips");

  const stmts: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM clips WHERE dump_id = ? AND status = 'draft'").bind(dumpId)];
  for (const c of clips) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, hook_alt, caption, hashtags, platforms, score, r2_key, cover_r2_key, media_token, status, hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      ).bind(c.id, c.asset_id, dumpId, c.start_s, c.end_s, c.recipe, c.hook_text, c.hook_alt, c.caption, c.hashtags, JSON.stringify(c.platforms), c.score, c.r2_key, c.cover_r2_key, mediaToken(), c.hidden ? 1 : 0),
    );
  }
  for (const a of (result as CutResult).assets ?? []) {
    const d = Number(a?.duration_s);
    if (allowed.has(String(a?.id)) && Number.isFinite(d) && d > 0) stmts.push(env.DB.prepare("UPDATE assets SET duration_s = ? WHERE id = ? AND dump_id = ?").bind(d, String(a.id), dumpId));
  }
  const readyAt = nowIso();
  stmts.push(env.DB.prepare("UPDATE dumps SET status = 'ready', clips_made = ?, ready_at = ?, error_summary = NULL WHERE id = ?").bind(clips.length, readyAt, dumpId));
  await env.DB.batch(stmts);

  const visible = clips.filter((c) => !c.hidden).length;
  const engine = (result as CutResult).engine ?? {};
  await recordEvent(env.DB, "dump.cut", dumpId, { clips: clips.length, visible, dropped, door: dump.door, engine });
  await clipCuttingLight(env, { status: "done", at: readyAt });
  log.info("cut.apply", { clips: clips.length, visible, dropped });

  const s = await readSettings(env);
  const hiddenNote = clips.length > visible ? ` ${clips.length - visible} more scored lower and are tucked away under "Show hidden".` : "";
  const { html, text } = emailFrame(
    "Your clips are ready",
    [`${visible} new clip${visible === 1 ? " is" : "s are"} waiting for you in Review.${hiddenNote}`, "Nothing posts until you approve it. Approve the ones you like, reject the rest."],
    { label: "Review clips", url: `${env.PUBLIC_BASE_URL}/review` },
  );
  await sendEmail(env, { kind: "clips_ready", to: s.notify_emails, subject: `${visible} clips ready to review`, html, text, refId: dumpId });
}

async function onFailure(env: Env, _jobId: string, dumpId: string | null, safeError: string): Promise<void> {
  if (!dumpId) return;
  await env.DB.prepare("UPDATE dumps SET status = 'failed', error_summary = ? WHERE id = ?").bind(plainFailure(safeError), dumpId).run();
  await clipCuttingLight(env, { status: "failed", at: nowIso() });
  log.warn("cut.failed", { len: safeError.length });
}

// ---------------------------------------------------------------- fake runner

// A 2-second 90×160 H.264/AAC MP4 (made once with ffmpeg; plays in every browser) and four
// 90×160 cover JPEGs in the brand colours. Bytes in code, so no fixture files to ship.
const FAKE_MP4_B64 = "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";
const FAKE_JPG_B64 = [
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgUFBcUFxsbGxsbGyAeICEhISAgICAhISEkJCQqKiokJCQhISQkKCgqKi4vLisrKisvLzIyMjw8OTlGRkhWVmf/xABNAAEBAAAAAAAAAAAAAAAAAAAABgEBAQEAAAAAAAAAAAAAAAAAAAUGEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAoABaAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AtwGUVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/9k=",
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgUFBcUFxsbGxsbGyAeICEhISAgICAhISEkJCQqKiokJCQhISQkKCgqKi4vLisrKisvLzIyMjw8OTlGRkhWVmf/xABNAAEBAAAAAAAAAAAAAAAAAAAABQEBAQEAAAAAAAAAAAAAAAAAAAMGEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAoABaAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AgAJtCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=",
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgUFBcUFxsbGxsbGyAeICEhISAgICAhISEkJCQqKiokJCQhISQkKCgqKi4vLisrKisvLzIyMjw8OTlGRkhWVmf/xABMAAEBAAAAAAAAAAAAAAAAAAAABwEBAQAAAAAAAAAAAAAAAAAAAAMQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCACgAFoDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCMgJqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/Z",
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgUFBcUFxsbGxsbGyAeICEhISAgICAhISEkJCQqKiokJCQhISQkKCgqKi4vLisrKisvLzIyMjw8OTlGRkhWVmf/xABNAAEBAAAAAAAAAAAAAAAAAAAABQEBAQEAAAAAAAAAAAAAAAAAAAUHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAoABaAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AiAKjPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/9k=",
];

const FAKE_HOOKS: [string, string][] = [
  ["POV: the kitchen after", "Nobody warned me about this part"],
  ["3 things I'd never skip", "Stop scrolling if you do this"],
  ["The moment it clicked", "I almost didn't post this"],
  ["Watch till the end", "This changed my whole week"],
  ["Real talk: day in my life", "Come with me for 30 seconds"],
  ["You asked, here it is", "The honest answer"],
  ["Before vs after", "Wait for it"],
  ["My 5 a.m. routine, unfiltered", "What mornings really look like"],
  ["The mistake everyone makes", "Please don't do this"],
  ["This is your sign", "Save this for later"],
  ["Story time", "So this happened"],
  ["Small win, big deal", "Celebrate with me"],
];
const FAKE_TAGS = ["#dayinmylife #realtalk #creator", "#motivation #mindset #womeninbusiness", "#behindthescenes #vlog #storytime", "#tips #lifehacks #smallbusiness"];
const FAKE_RECIPES: Recipe[] = ["talking_head", "hook_first", "story", "montage"];
// Fixed spread so every fake dump has a clear best, a middle and at least two under the bar.
const FAKE_SCORES = [0.92, 0.86, 0.81, 0.74, 0.68, 0.61, 0.55, 0.5, 0.41, 0.33, 0.78, 0.64];

function hashNum(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

async function fakeRun(env: Env, jobId: string, dumpId: string | null, options: Record<string, unknown>): Promise<CutResult> {
  const spec = await buildSpec(env, jobId, dumpId);
  if (!spec.assets.length) return { clips: [], engine: { picker: "fake" }, skipped: spec.skipped_assets.map((s) => ({ asset_id: s.id, reason: s.reason })) };
  const wanted = Number(options.clips);
  const count = Number.isInteger(wanted) && wanted >= 1 && wanted <= 24 ? wanted : 6 + (hashNum(spec.dump_id) % 7); // 6–12
  const mp4 = unb64(FAKE_MP4_B64);
  const clips: CutResultClip[] = [];
  for (let i = 0; i < count; i++) {
    const asset = spec.assets[i % spec.assets.length];
    const recipe: Recipe = spec.door === "recycle" ? "recycle" : FAKE_RECIPES[i % FAKE_RECIPES.length];
    const b = RECIPES[recipe];
    const len = b.minS + ((i * 7) % (b.maxS - b.minS + 1));
    const start = (i * 37) % 240;
    const id = newId("clp", 16);
    const key = `${spec.output_prefix}${id}.mp4`;
    const cover = `${spec.output_prefix}${id}.jpg`;
    await env.FILES.put(key, mp4, { httpMetadata: { contentType: "video/mp4" } });
    await env.FILES.put(cover, unb64(FAKE_JPG_B64[i % FAKE_JPG_B64.length]), { httpMetadata: { contentType: "image/jpeg" } });
    const [hook, alt] = FAKE_HOOKS[(i + hashNum(spec.dump_id)) % FAKE_HOOKS.length];
    clips.push({
      id,
      asset_id: asset.id,
      start_s: start,
      end_s: start + len,
      recipe,
      hook_text: hook,
      hook_alt: alt,
      caption: `${hook}. ${spec.door === "recycle" ? "A favourite, back with a new opening." : "Straight from this week."}`,
      hashtags: FAKE_TAGS[i % FAKE_TAGS.length],
      platforms: asset.allowed_platforms,
      score: FAKE_SCORES[i % FAKE_SCORES.length],
      r2_key: key,
      cover_r2_key: cover,
    });
  }
  return { clips, engine: { transcript: "fake", picker: "fake", crop: "fake", subtitles: "fake" }, skipped: spec.skipped_assets.map((s) => ({ asset_id: s.id, reason: s.reason })) };
}

export const cutJob: JobHandler = { buildSpec, applyResult, onFailure, fakeRun };
