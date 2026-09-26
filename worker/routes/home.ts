// Home (section 4): runway, this week, what is waiting, health lights, follow-ups, and the quiet
// "Your voice" card (voice narration is optional; this is its visible door).
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { listHealth, parseJson } from "../lib/db";
import { runwayWeeks, weeklyNeed } from "../domain/runway";
import { weekBounds } from "../domain/slotting";
import { readSettings } from "./settings";
import { dueDealItems } from "./deals";
import { PLATFORMS, type Platform } from "@shared/constants";
import type { DumpSummary, HomeSummary } from "@shared/types";
import { chooseEngine, homeVoiceCard } from "../domain/voiceEngine";
import { premiumState } from "../lib/premiumVoice";
import { fullVideoCards } from "../lib/fullVideo";

export const home = new Hono<{ Bindings: Env; Variables: Vars }>();
home.use("*", requireUser);

home.get("/", async (c) => {
  const db = c.env.DB;
  const s = await readSettings(c.env);
  const need = weeklyNeed(s.weekly_caps);
  const approved = (await db.prepare("SELECT COUNT(*) AS n FROM clips WHERE status = 'approved' AND id NOT IN (SELECT clip_id FROM posts WHERE status IN ('posted','in_buffer','planned'))").first<{ n: number }>())?.n ?? 0;

  const { start, end } = weekBounds(new Date(), s.audience_timezone);
  const { results: weekPosts } = await db.prepare("SELECT platform, status FROM posts WHERE scheduled_at >= ? AND scheduled_at < ? AND status != 'unscheduled'").bind(start, end).all<{ platform: Platform; status: string }>();
  const perPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, { posted: 0, cap: s.weekly_caps[p] }])) as Record<Platform, { posted: number; cap: number }>;
  let posted = 0;
  for (const p of weekPosts) {
    if (p.status === "posted") {
      posted++;
      perPlatform[p.platform].posted++;
    }
  }

  const waitingClips = (await db.prepare("SELECT COUNT(*) AS n FROM clips WHERE status = 'draft' AND hidden = 0").first<{ n: number }>())?.n ?? 0;
  const cutting = (await db.prepare("SELECT COUNT(*) AS n FROM dumps WHERE status IN ('queued','cutting')").first<{ n: number }>())?.n ?? 0;
  const briefDraft = await db.prepare("SELECT version FROM research_briefs WHERE status = 'draft' ORDER BY version DESC LIMIT 1").first();
  const profileLocked = await db.prepare("SELECT version FROM brand_profile WHERE locked = 1 LIMIT 1").first();

  // Deal emails due in the next two days (follow-ups, replies, reports, invoices, rebooks): the
  // same list the Monday recap reads (worker/routes/deals.ts dueDealItems).
  const followups = (await dueDealItems(c.env, new Date(Date.now() + 2 * 86400_000))).slice(0, 5);

  const { results: recent } = await db
    .prepare(
      `SELECT d.id, CASE WHEN d.kind = 'full_video' THEN 'youtube' ELSE d.door END AS door, d.notes, d.status, d.error_summary, d.clips_made, d.created_at, d.ready_at,
        (SELECT COUNT(*) FROM assets a WHERE a.dump_id = d.id AND a.upload_status != 'aborted') AS files,
        (SELECT j.progress FROM jobs j WHERE j.ref_id = d.id AND j.type = 'cut' ORDER BY j.created_at DESC LIMIT 1) AS progress
       FROM dumps d ORDER BY d.created_at DESC LIMIT 3`,
    )
    .all<Omit<DumpSummary, "progress"> & { progress: string | null }>();

  const health = await listHealth(db);
  const pv = await premiumState(c.env);
  // A real error only: the built-in job failed, or ElevenLabs refused the key. Yellow (no cloning
  // on her plan, low credits) is not a problem here; the built-in voice covers it.
  const bad = health.find((h) => (h.name === "Voice" || h.name === "Voice · ElevenLabs") && h.light === "red");
  const voice = homeVoiceCard({ hasSample: pv.hasSample, engine: chooseEngine(pv).engine, connection: pv.connection, problem: bad ? { note: bad.note, fix: bad.fix_guide } : null });

  const out: HomeSummary = {
    today: new Date().toISOString(),
    runway: { weeks: runwayWeeks(approved, need), approvedClips: approved, thresholdWeeks: s.runway_threshold_weeks, weeklyNeed: need },
    thisWeek: { posted, planned: weekPosts.length, perPlatform },
    waiting: { clips: waitingClips, dumpsCutting: cutting, briefNeedsApproval: !!briefDraft, profileUnlocked: !profileLocked },
    health,
    followups,
    recentDumps: recent.map((r) => ({ ...r, progress: parseJson(r.progress, null) })),
    voice,
    // A full video for YouTube: finish it in YouTube Studio, upload it yourself, or it is removed soon.
    youtube: await fullVideoCards(c.env),
  };
  return c.json(out);
});
