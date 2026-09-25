// Stats (BUILD_PLAN.md section 4 "What's working: top clips, best times, best cut styles",
// sections 4b and 17 for the TikTok export, phase 8 learning loop).
//   GET  /api/stats                 accounts per platform, top videos, best times, best cut
//                                   styles, learning status + learned slots, last sync/import
//   POST /api/stats/sync            start the metrics job (Instagram + YouTube)
//   POST /api/stats/tiktok-import   TikTok Studio export CSV → her TikTok results
//                                   (multipart field "file", a text/csv body, or JSON {csv});
//                                   columns documented in worker/domain/tiktokImport.ts
import { Hono, type Context } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { markConnection } from "../lib/connections";
import { getSetting, recordEvent, setHealth } from "../lib/db";
import { fail } from "../lib/http";
import { newId, nowIso } from "../lib/ids";
import { log } from "../lib/log";
import { dispatchJob } from "../services/github";
import { PLATFORMS, RECIPES, type Platform, type Slot } from "@shared/constants";
import { bucketByTime, historyDays, LEARN_MIN_DAYS, learningReady, rankRecipes } from "../domain/learning";
import { parseTikTokExport, recentAverageViews } from "../domain/tiktokImport";
import { loadObservations, updateLearnedSlots, upsertVideos } from "../jobs/metrics";
import { readSettings } from "./settings";

export const stats = new Hono<{ Bindings: Env; Variables: Vars }>();
stats.use("*", requireUser);

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

stats.get("/", async (c) => {
  const s = await readSettings(c.env);
  const obs = await loadObservations(c.env);
  const buckets = bucketByTime(obs, s.audience_timezone);

  const { results: accounts } = await c.env.DB.prepare(
    "SELECT a.platform, a.followers, a.avg_views, a.captured_at, a.source FROM account_stats a WHERE a.captured_at = (SELECT MAX(b.captured_at) FROM account_stats b WHERE b.platform = a.platform) GROUP BY a.platform",
  ).all<{ platform: Platform; followers: number; avg_views: number; captured_at: string; source: string }>();

  // Top videos: dashboard clips (with their hook) and her platform history, by views.
  const { results: topClips } = await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT p.id AS id, p.platform AS platform, c.hook_text AS title, c.recipe AS recipe, p.url AS url, COALESCE(p.posted_at, p.scheduled_at) AS posted_at,
              (SELECT m.views FROM metrics m WHERE m.post_id = p.id ORDER BY m.captured_at DESC LIMIT 1) AS views,
              (SELECT m.likes FROM metrics m WHERE m.post_id = p.id ORDER BY m.captured_at DESC LIMIT 1) AS likes, 'dashboard' AS origin
         FROM posts p JOIN clips c ON c.id = p.clip_id WHERE p.status = 'posted' AND EXISTS (SELECT 1 FROM metrics m WHERE m.post_id = p.id)
       UNION ALL
       SELECT pv.id, pv.platform, pv.title, NULL, pv.url, pv.posted_at, pv.views, pv.likes, pv.source
         FROM platform_videos pv WHERE pv.post_id IS NULL
     ) ORDER BY views DESC LIMIT 10`,
  ).all<{ id: string; platform: Platform; title: string | null; recipe: string | null; url: string | null; posted_at: string | null; views: number; likes: number; origin: string }>();

  const bestTimes = {} as Record<Platform, { day: number; hour: number; posts: number; avg_views: number }[]>;
  const learning = {} as Record<Platform, { videos: number; days: number; needDays: number; ready: boolean }>;
  for (const p of PLATFORMS) {
    bestTimes[p] = buckets.filter((b) => b.platform === p).slice(0, 5).map(({ day, hour, posts, avg_views }) => ({ day, hour, posts, avg_views }));
    learning[p] = { videos: obs.filter((o) => o.platform === p).length, days: historyDays(obs, p), needDays: LEARN_MIN_DAYS, ready: learningReady(obs, p) };
  }
  const bestRecipes = rankRecipes(obs.filter((o) => o.recipe).map((o) => ({ recipe: o.recipe as string, views: o.views }))).map((r) => ({ ...r, label: RECIPES[r.recipe as keyof typeof RECIPES]?.label ?? r.recipe }));

  const conns = await c.env.DB.prepare("SELECT service, status, meta, last_ok_at FROM connections WHERE service IN ('meta', 'google', 'tiktok')").all<{ service: string; status: string; meta: string; last_ok_at: string | null }>();
  const job = await c.env.DB.prepare("SELECT id, status, safe_error, created_at FROM jobs WHERE type = 'metrics' ORDER BY created_at DESC LIMIT 1").first();

  return c.json({
    accounts,
    topClips,
    bestTimes,
    bestRecipes,
    learning,
    learnedSlots: await getSetting<Partial<Record<Platform, Slot[]>>>(c.env.DB, "learned_slots", {}),
    learnedAt: await getSetting<string | null>(c.env.DB, "learned_slots_at", null),
    connections: conns.results.map((r) => ({ service: r.service, status: r.status, last_ok_at: r.last_ok_at, meta: JSON.parse(r.meta || "{}") })),
    job,
    timezone: s.audience_timezone,
  });
});

stats.post("/sync", async (c) => {
  const any = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM connections WHERE service IN ('meta', 'google') AND status = 'ok'").first<{ n: number }>();
  if (!any?.n) return fail(c, 409, "Connect Instagram or YouTube stats first. TikTok results come from the export you upload here.", "connect-stats");
  const r = await dispatchJob(c.env, "metrics", null);
  if (!r.dispatched) return fail(c, 502, r.error ?? "The stats sync could not start.", "connect-stats");
  await recordEvent(c.env.DB, "metrics.sync", r.jobId, {}, c.get("user").email);
  return c.json({ ok: true, jobId: r.jobId });
});

async function readCsv(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<string | null> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return null;
    if (file.size > MAX_IMPORT_BYTES) throw new RangeError("too big");
    return file.text();
  }
  if (type.includes("application/json")) {
    const body = (await c.req.json().catch(() => null)) as { csv?: unknown } | null;
    return typeof body?.csv === "string" ? body.csv : null;
  }
  const text = await c.req.text();
  return text || null;
}

stats.post("/tiktok-import", async (c) => {
  let csv: string | null;
  try {
    csv = await readCsv(c);
  } catch {
    return fail(c, 413, "That file is too big. The TikTok export is usually under 1 MB; pick the Content file.", "upload-your-tiktok-export");
  }
  if (!csv) return fail(c, 400, "Pick the CSV file you downloaded from TikTok Studio.", "upload-your-tiktok-export");
  if (csv.length > MAX_IMPORT_BYTES) return fail(c, 413, "That file is too big. The TikTok export is usually under 1 MB; pick the Content file.", "upload-your-tiktok-export");
  if (csv.startsWith("PK")) return fail(c, 422, "That is an Excel file. In TikTok Studio, pick CSV when you download, then upload that.", "upload-your-tiktok-export");

  const parsed = parseTikTokExport(csv);
  if (parsed.kind === "unknown") return fail(c, 422, "This doesn't look like a TikTok Studio export. Download the Content file (CSV) and upload that.", "upload-your-tiktok-export");

  const now = nowIso();
  let videos = 0;
  if (parsed.kind === "content") {
    videos = await upsertVideos(
      c.env,
      parsed.videos.map((v) => ({ ...v, platform: "tiktok" as const })),
      "import",
    );
  }
  // Account row: follower count from this file (or the last known), average views of recent videos.
  const prev = await c.env.DB.prepare("SELECT followers FROM account_stats WHERE platform = 'tiktok' ORDER BY captured_at DESC LIMIT 1").first<{ followers: number }>();
  const { results: all } = await c.env.DB.prepare("SELECT posted_at, views FROM platform_videos WHERE platform = 'tiktok'").all<{ posted_at: string | null; views: number }>();
  await c.env.DB.prepare("INSERT INTO account_stats (id, platform, captured_at, followers, avg_views, source) VALUES (?, 'tiktok', ?, ?, ?, 'import')")
    .bind(newId("acs"), now, parsed.followers ?? prev?.followers ?? 0, recentAverageViews(all))
    .run();
  await markConnection(c.env, "tiktok", "ok", null, { via: "import", last_import_at: now, videos: all.length });
  await setHealth(c.env.DB, "TikTok stats", "green", `Imported · ${all.length} videos`, null);
  const learned = await updateLearnedSlots(c.env);
  await recordEvent(c.env.DB, "tiktok.import", null, { videos, kind: parsed.kind, skipped: parsed.skipped }, c.get("user").email);
  log.info("tiktok.import", { videos, skipped: parsed.skipped, kind: parsed.kind });
  return c.json({ ok: true, kind: parsed.kind, videos, skipped: parsed.skipped, followers: parsed.followers, learned: Object.keys(learned) });
});
