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
//
// Looks (worker/domain/looks.ts, jobs/looks.json): the spec carries the rotation of her enabled
// Looks and each Look resolved with her Settings > Editing switches, so a dump's clips vary;
// every clip comes back with its `look`, its `parts` and (grids) its `layout`.
// A job whose ref is "<dumpId>/<clipId>" is a re-render of one clip in the Look she picked in
// Review ("Change look"): the old file stays live until the new one is swapped in here.
import type { JobHandler } from "./registry";
import type { Env } from "../env";
import { log } from "../lib/log";
import { parseJson, recordEvent } from "../lib/db";
import { clipCuttingLight } from "../crons/buffer-sync";
import { heldSentence, sourceVerdict, type SourceMark, type SourceOwner } from "../domain/sourceCheck";
import { mediaToken, newId, nowIso } from "../lib/ids";
import { unb64 } from "../lib/crypto";
import { emailFrame, sendEmail } from "../services/email";
import { readSettings } from "../routes/settings";
import { weeklyNeed } from "../domain/runway";
import { rankRecycle, recyclePlatforms, type PriorPost } from "../domain/cooldown";
import { PLATFORMS, QUALITY_BAR, RECIPES, type Platform, type Recipe } from "@shared/constants";
import {
  brandingFor,
  cellCount,
  cleanGridLayout,
  defaultGridLayout,
  editingFromStored,
  isGridLook,
  isLookId,
  lookForClip,
  resolveLook,
  rotationFor,
  type Branding,
  type GridLayout,
  type LookId,
  type ResolvedLook,
  type StoredEditing,
} from "../domain/looks";
import { getSetting } from "../lib/db";
import { CUT_REF } from "../lib/jobStorage";

/** A cut job's ref: a dump ("dmp_…"), or one clip of it to re-render ("dmp_…/clp_…"). */
export function parseCutRef(refId: string | null): { dumpId: string; clipId: string | null } | null {
  const m = CUT_REF.exec(refId ?? "");
  return m ? { dumpId: m[1], clipId: m[2] ?? null } : null;
}

/** Everything a render needs from her settings: the editing switches, her songs, her branding. */
export async function renderContext(env: Env): Promise<{ editing: ReturnType<typeof editingFromStored>; music: { r2_key: string }[]; branding: Branding }> {
  const editing = editingFromStored(await getSetting<StoredEditing>(env.DB, "editing", {}));
  const { results: tracks } = await env.DB.prepare("SELECT r2_key FROM music_tracks ORDER BY created_at").all<{ r2_key: string }>();
  const profile = await env.DB.prepare("SELECT sections FROM brand_profile WHERE locked = 1 ORDER BY version DESC LIMIT 1").first<{ sections: string }>();
  const buffer = await env.DB.prepare("SELECT meta FROM connections WHERE service = 'buffer' AND status = 'ok'").first<{ meta: string }>();
  const channels = parseJson<{ channels?: { platform?: string; handle?: string }[] }>(buffer?.meta, {}).channels ?? [];
  return {
    editing,
    music: editing.music ? tracks.map((t) => ({ r2_key: t.r2_key })) : [],
    branding: brandingFor(profile ? parseJson<Record<string, string>>(profile.sections, {}) : null, channels),
  };
}

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
  /** Clip k takes rotation[k % length] (rotationFor: her enabled Looks, varied per dump). */
  rotation: LookId[];
  /** Each Look in the rotation, resolved with her Settings > Editing switches. */
  looks: Partial<Record<LookId, ResolvedLook>>;
  branding: Branding;
  /** Her own songs (Settings > Editing > My music), only when the music bed is on. */
  music: { r2_key: string }[];
}

/** One stretch of a source video for a re-render: a raw upload or, when that is gone, a clip file. */
export interface RerenderStretch {
  src: string;
  start: number;
  end: number;
  zoom?: number;
}

export interface RerenderSpec {
  job_id: string;
  type: "cut";
  mode: "rerender";
  dump_id: string;
  clip_id: string;
  asset_id: string;
  recipe: Recipe;
  hook_text: string;
  look_id: LookId;
  look: ResolvedLook;
  parts: RerenderStretch[];
  cells: RerenderStretch[] | null;
  voice: number;
  branding: Branding;
  music: { r2_key: string }[];
  output_key: string;
  output_cover_key: string;
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

async function buildSpec(env: Env, jobId: string, refId: string | null): Promise<CutSpec | RerenderSpec> {
  const ref = parseCutRef(refId);
  if (!ref) throw new Error("cut job has no dump");
  if (ref.clipId) return buildRerenderSpec(env, jobId, ref.dumpId, ref.clipId);
  return buildDumpSpec(env, jobId, ref.dumpId);
}

async function buildDumpSpec(env: Env, jobId: string, dumpId: string): Promise<CutSpec> {
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
  const ctx = await renderContext(env);
  const rotation = rotationFor(ctx.editing.looks, dump.id);
  const looks = Object.fromEntries(rotation.map((id) => [id, resolveLook(id, ctx.editing, ctx.music.length > 0)])) as CutSpec["looks"];
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
    rotation,
    looks,
    branding: ctx.branding,
    music: ctx.music,
  };
}

interface ClipSourceDb {
  id: string;
  dump_id: string;
  asset_id: string;
  start_s: number;
  end_s: number;
  recipe: Recipe;
  hook_text: string;
  r2_key: string;
  parts: string | null;
  layout: string | null;
  pending_look: string | null;
  pending_layout: string | null;
  media_version: number;
  raw_key: string;
  raw_deleted_at: string | null;
  asset_duration: number | null;
}

const CLIP_SOURCE_SQL = `SELECT c.id, c.dump_id, c.asset_id, c.start_s, c.end_s, c.recipe, c.hook_text, c.r2_key, c.parts, c.layout, c.pending_look, c.pending_layout,
  c.media_version, a.r2_key AS raw_key, a.raw_deleted_at, a.duration_s AS asset_duration FROM clips c JOIN assets a ON a.id = c.asset_id`;

/** The file names a re-render writes: the clip's id and the next version, inside its dump's folder. */
export function rerenderKeys(dumpId: string, clipId: string, version: number): { mp4: string; jpg: string } {
  return { mp4: `clips/${dumpId}/${clipId}-v${version}.mp4`, jpg: `clips/${dumpId}/${clipId}-v${version}.jpg` };
}

/** The stretches a clip plays, in order: its saved parts, else start → end. */
export function clipParts(c: { start_s: number; end_s: number; parts: string | null }): [number, number][] {
  const saved = parseJson<unknown>(c.parts, null);
  if (Array.isArray(saved) && saved.length && saved.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > p[0]))
    return saved as [number, number][];
  return [[c.start_s, c.end_s]];
}

/** Where a clip's picture can come from for a re-render: its raw upload while it is kept, else its own file. */
export function clipSource(c: Pick<ClipSourceDb, "raw_key" | "raw_deleted_at" | "r2_key" | "start_s" | "end_s">, length: number): RerenderStretch {
  if (!c.raw_deleted_at) return { src: c.raw_key, start: c.start_s, end: c.start_s + length };
  return { src: c.r2_key, start: 0, end: Math.min(length, c.end_s - c.start_s) };
}

async function buildRerenderSpec(env: Env, jobId: string, dumpId: string, clipId: string): Promise<RerenderSpec> {
  const clip = await env.DB.prepare(`${CLIP_SOURCE_SQL} WHERE c.id = ? AND c.dump_id = ?`).bind(clipId, dumpId).first<ClipSourceDb>();
  if (!clip || !clip.pending_look || !isLookId(clip.pending_look)) throw new Error("clip has no pending look");
  if (clip.raw_deleted_at) throw new Error("clip source cleared");
  const ctx = await renderContext(env);
  const look = resolveLook(clip.pending_look, ctx.editing, ctx.music.length > 0);
  const parts = clipParts(clip);
  let cells: RerenderStretch[] | null = null;
  let voice = 0;
  if (isGridLook(clip.pending_look)) {
    const layout = parseJson<GridLayout | null>(clip.pending_layout, null) ?? defaultGridLayout(clip.pending_look, []);
    const length = clip.end_s - clip.start_s;
    const self: RerenderStretch = { src: clip.raw_key, start: clip.start_s, end: clip.end_s };
    cells = [];
    for (const cell of layout.cells) {
      if (cell.kind === "self") cells.push(self);
      else if (cell.kind === "zoom") cells.push({ ...self, zoom: cell.zoom });
      else {
        const other = await env.DB.prepare(`${CLIP_SOURCE_SQL} WHERE c.id = ? AND c.status != 'deleted'`).bind(cell.clip_id).first<ClipSourceDb>();
        const stretch = other ? clipSource(other, length) : { ...self, zoom: 1.35 };
        if (other && !other.raw_deleted_at && other.asset_duration) stretch.end = Math.min(stretch.end, other.asset_duration);
        cells.push(stretch);
      }
    }
    voice = layout.voice;
  }
  const keys = rerenderKeys(dumpId, clipId, clip.media_version + 1);
  return {
    job_id: jobId,
    type: "cut",
    mode: "rerender",
    dump_id: dumpId,
    clip_id: clipId,
    asset_id: clip.asset_id,
    recipe: clip.recipe,
    hook_text: clip.hook_text,
    look_id: clip.pending_look,
    look,
    parts: parts.map(([start, end]) => ({ src: clip.raw_key, start, end })),
    cells,
    voice,
    branding: ctx.branding,
    music: ctx.music,
    output_key: keys.mp4,
    output_cover_key: keys.jpg,
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
  /** The Look it was rendered in (jobs/looks.json). */
  look?: string | null;
  /** [[start_s, end_s], ...] in play order. */
  parts?: [number, number][] | null;
  /** Grid Looks: which moment is in each cell and whose sound plays. */
  layout?: unknown;
}

export interface CutResult {
  clips: CutResultClip[];
  /** Which tools actually ran, so "clips look wrong" can be traced. */
  engine?: { transcript?: string; picker?: string; crop?: string; subtitles?: string };
  skipped?: { asset_id: string; reason: string }[];
  /** Measured source lengths; stored on assets.duration_s. */
  assets?: { id: string; duration_s: number }[];
  /** Platform watermarks and @handles the job read on sampled frames (worker/domain/sourceCheck.ts). */
  source_marks?: SourceMark[];
}

/**
 * Whose video each asset is, from the job's watermark reading and her Buffer channels' handles.
 * Only assets of this dump; an asset she already confirmed as hers stays confirmed.
 */
export function sourceUpdates(marks: unknown, assetIds: Set<string>, ownHandles: string[]): { asset_id: string; owner: SourceOwner; note: string | null }[] {
  if (!Array.isArray(marks)) return [];
  const out: { asset_id: string; owner: SourceOwner; note: string | null }[] = [];
  for (const raw of marks.slice(0, 200)) {
    const m = (raw ?? {}) as Partial<SourceMark>;
    const id = String(m.asset_id ?? "");
    if (!assetIds.has(id) || out.some((o) => o.asset_id === id)) continue;
    const platform = m.platform === "tiktok" || m.platform === "instagram" ? m.platform : null;
    const handles = Array.isArray(m.handles) ? m.handles.filter((h): h is string => typeof h === "string").map((h) => h.slice(0, 40)).slice(0, 10) : [];
    const v = sourceVerdict({ platform, handles }, ownHandles);
    if (v) out.push({ asset_id: id, owner: v.owner, note: v.owner === "other" ? heldSentence(v.foreign, platform) : null });
  }
  return out;
}

/** Her own handles: the channels in her connected Buffer. */
export async function ownHandles(env: Env): Promise<string[]> {
  const row = await env.DB.prepare("SELECT meta FROM connections WHERE service = 'buffer'").first<{ meta: string }>();
  return parseJson<{ channels?: { handle?: string }[] }>(row?.meta, {}).channels?.map((c) => String(c.handle ?? "")).filter(Boolean) ?? [];
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
  look: LookId | null;
  parts: [number, number][];
  layout: GridLayout | null;
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
    const look = isLookId(c.look) ? c.look : null;
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
      look,
      parts: cleanParts(c.parts, start, end),
      layout: look && isGridLook(look) ? (cleanGridLayout(look, c.layout) ?? defaultGridLayout(look, [])) : null,
    });
  }
  return { clips, dropped };
}

/** The parts a clip plays: at most 4, each inside the source's 0 … end_s + 1 h, else [start, end]. */
export function cleanParts(v: unknown, start: number, end: number): [number, number][] {
  if (Array.isArray(v) && v.length >= 1 && v.length <= 4) {
    const out: [number, number][] = [];
    for (const p of v) {
      const a = Number(Array.isArray(p) ? p[0] : NaN);
      const b = Number(Array.isArray(p) ? p[1] : NaN);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b > end + 3600) return [[start, end]];
      out.push([Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
    }
    return out;
  }
  return [[start, end]];
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

async function applyResult(env: Env, jobId: string, refId: string | null, result: unknown): Promise<void> {
  const ref = parseCutRef(refId);
  if (!ref) throw new CutResultError("cut job has no dump");
  if (ref.clipId) return applyRerender(env, jobId, ref.dumpId, ref.clipId, result);
  const dumpId = ref.dumpId;
  const dump = await env.DB.prepare("SELECT id, door FROM dumps WHERE id = ?").bind(dumpId).first<{ id: string; door: "new" | "recycle" }>();
  if (!dump) throw new CutResultError("dump missing");
  // The allowed platforms are recomputed from the database, not taken from the job.
  const spec = await buildDumpSpec(env, jobId, dumpId);
  const allowed = new Map(spec.assets.map((a) => [a.id, a.allowed_platforms]));
  const rawKeys = new Set(spec.assets.map((a) => a.r2_key));
  const { clips, dropped } = parseCutResult(result, { dumpId, allowed, rawKeys });
  if (!clips.length) throw new CutResultError("no usable clips");

  const stmts: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM clips WHERE dump_id = ? AND status = 'draft'").bind(dumpId)];
  for (const c of clips) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, hook_alt, caption, hashtags, platforms, score, r2_key, cover_r2_key, media_token, status, hidden, look, parts, layout)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      ).bind(
        c.id, c.asset_id, dumpId, c.start_s, c.end_s, c.recipe, c.hook_text, c.hook_alt, c.caption, c.hashtags, JSON.stringify(c.platforms), c.score, c.r2_key, c.cover_r2_key, mediaToken(), c.hidden ? 1 : 0,
        c.look, JSON.stringify(c.parts), c.layout ? JSON.stringify(c.layout) : null,
      ),
    );
  }
  const own = await ownHandles(env);
  const held = sourceUpdates((result as CutResult).source_marks, new Set(allowed.keys()), own);
  for (const h of held) {
    stmts.push(env.DB.prepare("UPDATE assets SET source_owner = ?, source_note = ? WHERE id = ? AND dump_id = ? AND (source_owner IS NULL OR source_owner != 'confirmed')").bind(h.owner, h.note, h.asset_id, dumpId));
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
  const looks = new Set(clips.map((c) => c.look).filter(Boolean)).size;
  await recordEvent(env.DB, "dump.cut", dumpId, { clips: clips.length, visible, dropped, door: dump.door, engine, looks, held_videos: held.filter((h) => h.owner === "other").length });
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

/** The re-render's answer, checked like every job result: its own clip, the file names it was given. */
export function parseRerender(result: unknown, expect: { clipId: string; look: string; mp4: string; jpg: string }): { duration_s: number | null; voice: number | null } {
  const r = (result as { rerender?: Record<string, unknown> } | null)?.rerender;
  if (!r || typeof r !== "object") throw new CutResultError("result has no re-render");
  if (r.clip_id !== expect.clipId || r.look !== expect.look || r.r2_key !== expect.mp4 || r.cover_r2_key !== expect.jpg) throw new CutResultError("re-render result does not match its clip");
  const d = Number(r.duration_s);
  const v = typeof r.voice === "number" ? r.voice : NaN;
  return { duration_s: Number.isFinite(d) && d > 0 ? d : null, voice: Number.isInteger(v) && v >= 0 ? v : null };
}

/** The sentence on the clip when a re-render fails; the old version stays. */
export const RERENDER_FAILED = "The new look didn't finish, so your clip is unchanged. Try Change look again.";

async function applyRerender(env: Env, _jobId: string, dumpId: string, clipId: string, result: unknown): Promise<void> {
  const clip = await env.DB.prepare("SELECT id, status, r2_key, cover_r2_key, pending_look, pending_layout, media_version FROM clips WHERE id = ? AND dump_id = ?").bind(clipId, dumpId).first<{
    id: string;
    status: string;
    r2_key: string;
    cover_r2_key: string | null;
    pending_look: string | null;
    pending_layout: string | null;
    media_version: number;
  }>();
  const keys = rerenderKeys(dumpId, clipId, (clip?.media_version ?? 0) + 1);
  if (!clip || clip.status === "deleted" || !clip.pending_look) {
    // Deleted (or already applied) while it rendered: the new files have nowhere to go.
    await env.FILES.delete([keys.mp4, keys.jpg]);
    log.info("cut.rerender.orphan", {});
    return;
  }
  const r = parseRerender(result, { clipId, look: clip.pending_look, mp4: keys.mp4, jpg: keys.jpg });
  let layout = parseJson<GridLayout | null>(clip.pending_layout, null);
  if (isLookId(clip.pending_look) && isGridLook(clip.pending_look)) {
    layout = layout ?? defaultGridLayout(clip.pending_look, []);
    if (r.voice !== null && r.voice < cellCount(clip.pending_look)) layout = { ...layout, voice: r.voice };
  } else layout = null;
  await env.DB.prepare(
    `UPDATE clips SET r2_key = ?, cover_r2_key = ?, look = pending_look, layout = ?, pending_look = NULL, pending_layout = NULL, rerender_job_id = NULL,
       rerender_error = NULL, media_version = media_version + 1, edited_with = NULL WHERE id = ?`,
  )
    .bind(keys.mp4, keys.jpg, layout ? JSON.stringify(layout) : null, clipId)
    .run();
  const old = [clip.r2_key, clip.cover_r2_key].filter((k): k is string => !!k && k !== keys.mp4 && k !== keys.jpg);
  if (old.length) await env.FILES.delete(old);
  await recordEvent(env.DB, "clip.look_changed", clipId, { look: clip.pending_look });
  log.info("cut.rerender.apply", {});
}

async function onFailure(env: Env, jobId: string, refId: string | null, safeError: string): Promise<void> {
  const ref = parseCutRef(refId);
  if (!ref) return;
  if (ref.clipId) {
    await env.DB.prepare("UPDATE clips SET pending_look = NULL, pending_layout = NULL, rerender_job_id = NULL, rerender_error = ? WHERE id = ? AND rerender_job_id = ?")
      .bind(RERENDER_FAILED, ref.clipId, jobId)
      .run();
    log.warn("cut.rerender.failed", { len: safeError.length });
    return;
  }
  const dumpId = ref.dumpId;
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

async function fakeRun(env: Env, jobId: string, refId: string | null, options: Record<string, unknown>): Promise<CutResult | { rerender: Record<string, unknown> }> {
  const ref = parseCutRef(refId);
  if (!ref) throw new Error("cut job has no dump");
  if (ref.clipId) {
    // The fake re-render copies the clip's file to the new name, as the real job uploads a new one.
    const spec = await buildRerenderSpec(env, jobId, ref.dumpId, ref.clipId);
    await env.FILES.put(spec.output_key, unb64(FAKE_MP4_B64), { httpMetadata: { contentType: "video/mp4" } });
    await env.FILES.put(spec.output_cover_key, unb64(FAKE_JPG_B64[hashNum(spec.look_id) % FAKE_JPG_B64.length]), { httpMetadata: { contentType: "image/jpeg" } });
    return { rerender: { clip_id: spec.clip_id, look: spec.look_id, r2_key: spec.output_key, cover_r2_key: spec.output_cover_key, duration_s: 2, voice: spec.cells ? spec.voice : null } };
  }
  const spec = await buildDumpSpec(env, jobId, ref.dumpId);
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
    const look = lookForClip(spec.rotation, i);
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
      look,
      parts: [[start, start + len]],
      layout: null,
    });
  }
  // Grid Looks: the other clips of this dump fill the cells, as the real job does.
  for (const c of clips) {
    if (c.look && isLookId(c.look) && isGridLook(c.look)) c.layout = defaultGridLayout(c.look, clips.filter((o) => o.id !== c.id).map((o) => o.id));
  }
  // A test can ask the fake to "see" a watermark on the first video (the real job reads it by OCR).
  const marks = Array.isArray(options.source_marks) ? (options.source_marks as Omit<SourceMark, "asset_id">[]).map((m) => ({ ...m, asset_id: spec.assets[0]!.id })) : undefined;
  return { clips, engine: { transcript: "fake", picker: "fake", crop: "fake", subtitles: "fake" }, skipped: spec.skipped_assets.map((s) => ({ asset_id: s.id, reason: s.reason })), ...(marks ? { source_marks: marks } : {}) };
}

export const cutJob: JobHandler = { buildSpec, applyResult, onFailure, fakeRun };
