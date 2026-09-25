// Daily lane: supply monitor ("Time to dump" email), retention (raw originals after 7 days,
// rejected clips after 7 days, clips 30 days after posting), storage light, health recheck.
import type { Env } from "../env";
import { runwayLow, runwayWeeks, weeklyNeed } from "../domain/runway";
import { setHealth } from "../lib/db";
import { log } from "../lib/log";
import { readSettings } from "../routes/settings";
import { emailFrame, sendEmail } from "../services/email";
import { serviceHealthRows } from "./buffer-sync";
import { CLIP_RETENTION_AFTER_POST_DAYS, RAW_RETENTION_DAYS, REJECTED_RETENTION_DAYS, TIME_TO_DUMP_REPEAT_DAYS } from "@shared/constants";

export async function dailyMaintenance(env: Env): Promise<void> {
  await supplyMonitor(env);
  await retention(env);
  await storageLight(env);
  // Email + job runner + clip cutting lights exist from the first day, before any hourly run.
  await serviceHealthRows(env);
}

async function supplyMonitor(env: Env) {
  const s = await readSettings(env);
  const approved = (await env.DB.prepare("SELECT COUNT(*) AS n FROM clips WHERE status = 'approved' AND id NOT IN (SELECT clip_id FROM posts WHERE status IN ('posted','in_buffer','planned'))").first<{ n: number }>())?.n ?? 0;
  const low = runwayLow(approved, s.weekly_caps, s.runway_threshold_weeks);
  const weeks = runwayWeeks(approved, weeklyNeed(s.weekly_caps));
  await setHealth(env.DB, "Runway", low ? "yellow" : "green", `${Number.isFinite(weeks) ? weeks : "∞"} weeks of approved clips`, low ? "dump-new-footage" : null);
  if (!low) return;

  // Repeat every 3 days until a dump arrives; a dump newer than the last email resets it.
  const last = await env.DB.prepare("SELECT sent_at FROM emails_sent WHERE kind = 'time_to_dump' ORDER BY sent_at DESC LIMIT 1").first<{ sent_at: string }>();
  const lastDump = await env.DB.prepare("SELECT created_at FROM dumps WHERE status != 'uploading' ORDER BY created_at DESC LIMIT 1").first<{ created_at: string }>();
  if (last && new Date(last.sent_at).getTime() > Date.now() - TIME_TO_DUMP_REPEAT_DAYS * 86400_000) return;
  if (last && lastDump && lastDump.created_at > last.sent_at) {
    // she dumped since the last nag: only nag again if still low after cutting
    const cutting = await env.DB.prepare("SELECT COUNT(*) AS n FROM dumps WHERE status IN ('queued','cutting','ready')").first<{ n: number }>();
    if ((cutting?.n ?? 0) > 0) return;
  }
  const brief = await env.DB.prepare("SELECT body FROM research_briefs WHERE status = 'approved' ORDER BY version DESC LIMIT 1").first<{ body: string }>();
  let shots: string[] = [];
  try {
    const body = brief ? (JSON.parse(brief.body) as { shot_list?: { text: string }[] }) : null;
    shots = (body?.shot_list ?? []).slice(0, 3).map((c) => c.text);
  } catch {
    shots = [];
  }
  const lines = [
    `You have about ${Number.isFinite(weeks) ? weeks : 0} weeks of approved clips left (${approved} clips).`,
    shots.length ? "What to film next:" : "Film anything you like and dump it; the cutter does the rest.",
    ...shots.map((t, i) => `${i + 1}. ${t}`),
  ];
  const { html, text } = emailFrame("Time to dump some footage", lines, { label: "Open Dump", url: `${env.PUBLIC_BASE_URL}/dump` });
  await sendEmail(env, { kind: "time_to_dump", to: s.notify_emails, subject: "Time to dump: under 2 weeks of clips left", html, text });
}

async function retention(env: Env) {
  const now = Date.now();
  const rawCutoff = new Date(now - RAW_RETENTION_DAYS * 86400_000).toISOString();
  const { results: raws } = await env.DB.prepare(
    "SELECT a.id, a.r2_key FROM assets a JOIN dumps d ON d.id = a.dump_id WHERE a.raw_deleted_at IS NULL AND a.upload_status = 'uploaded' AND d.status IN ('ready','reviewed') AND d.ready_at < ? LIMIT 50",
  )
    .bind(rawCutoff)
    .all<{ id: string; r2_key: string }>();
  for (const a of raws) {
    await env.FILES.delete(a.r2_key);
    await env.DB.prepare("UPDATE assets SET raw_deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), a.id).run();
  }

  const rejCutoff = new Date(now - REJECTED_RETENTION_DAYS * 86400_000).toISOString();
  const { results: rejected } = await env.DB.prepare("SELECT id, r2_key, cover_r2_key FROM clips WHERE status = 'rejected' AND reviewed_at < ? LIMIT 100").bind(rejCutoff).all<{ id: string; r2_key: string; cover_r2_key: string | null }>();
  for (const cl of rejected) {
    await env.FILES.delete(cl.r2_key);
    if (cl.cover_r2_key) await env.FILES.delete(cl.cover_r2_key);
    await env.DB.prepare("UPDATE clips SET status = 'deleted', media_token = NULL WHERE id = ?").bind(cl.id).run();
  }

  const postCutoff = new Date(now - CLIP_RETENTION_AFTER_POST_DAYS * 86400_000).toISOString();
  const { results: posted } = await env.DB.prepare(
    "SELECT c.id, c.r2_key FROM clips c WHERE c.status = 'approved' AND c.media_token IS NOT NULL AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.clip_id = c.id AND p.status IN ('planned','in_buffer')) AND EXISTS (SELECT 1 FROM posts p WHERE p.clip_id = c.id AND p.status = 'posted') AND (SELECT MAX(posted_at) FROM posts p WHERE p.clip_id = c.id) < ? LIMIT 100",
  )
    .bind(postCutoff)
    .all<{ id: string; r2_key: string }>();
  for (const cl of posted) {
    // keep the file for the media kit / stats; the public media link expires (section 13)
    await env.DB.prepare("UPDATE clips SET media_token = NULL WHERE id = ?").bind(cl.id).run();
  }
  log.info("retention", { raws: raws.length, rejected: rejected.length, expired_links: posted.length });
}

async function storageLight(env: Env) {
  const row = await env.DB.prepare(
    "SELECT (SELECT COALESCE(SUM(size_bytes),0) FROM assets WHERE upload_status = 'uploaded' AND raw_deleted_at IS NULL) + (SELECT COALESCE(SUM(size_bytes),0) FROM brand_docs) AS bytes",
  ).first<{ bytes: number }>();
  const gb = (row?.bytes ?? 0) / 1024 ** 3;
  const light = gb > 9 ? "red" : gb > 7 ? "yellow" : "green";
  await setHealth(env.DB, "Storage", light, `${gb.toFixed(1)} of 10 GB`, light === "green" ? null : "storage-almost-full");
}
