// Dump: two doors, notes, the Dump button (section 7). A dump is created before the files
// upload, files attach to it, and Dump flips it to queued and starts the cut job.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { recordEvent, parseJson } from "../lib/db";
import { fail, readJson } from "../lib/http";
import { newId, nowIso } from "../lib/ids";
import { log } from "../lib/log";
import { dispatchJob } from "../services/github";
import type { AssetRow, DumpSummary } from "@shared/types";

export const dumps = new Hono<{ Bindings: Env; Variables: Vars }>();
dumps.use("*", requireUser);

interface DumpDb {
  id: string;
  door: "new" | "recycle";
  notes: string;
  status: DumpSummary["status"];
  error_summary: string | null;
  clips_made: number;
  created_at: string;
  ready_at: string | null;
  files: number;
  progress: string | null;
  held_note: string | null;
}

const SELECT = `SELECT d.id, d.door, d.notes, d.status, d.error_summary, d.clips_made, d.created_at, d.ready_at,
  (SELECT COUNT(*) FROM assets a WHERE a.dump_id = d.id AND a.upload_status != 'aborted') AS files,
  (SELECT j.progress FROM jobs j WHERE j.ref_id = d.id AND j.type = 'cut' ORDER BY j.created_at DESC LIMIT 1) AS progress,
  (SELECT a.source_note FROM assets a WHERE a.dump_id = d.id AND a.source_owner = 'other' LIMIT 1) AS held_note
  FROM dumps d`;

function view(r: DumpDb): DumpSummary {
  return { ...r, progress: parseJson(r.progress, null) };
}

dumps.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(`${SELECT} ORDER BY d.created_at DESC LIMIT 30`).all<DumpDb>();
  return c.json(results.map(view));
});

dumps.post("/", async (c) => {
  const body = await readJson<{ door: "new" | "recycle"; notes?: string }>(c);
  if (body?.door !== "new" && body?.door !== "recycle") return fail(c, 400, "Pick a door: new footage or recycle old videos.");
  const id = newId("dmp");
  await c.env.DB.prepare("INSERT INTO dumps (id, door, notes, status) VALUES (?, ?, ?, 'uploading')").bind(id, body.door, (body.notes ?? "").slice(0, 4000)).run();
  return c.json({ id });
});

dumps.get("/:id", async (c) => {
  const row = await c.env.DB.prepare(`${SELECT} WHERE d.id = ?`).bind(c.req.param("id")).first<DumpDb>();
  if (!row) return fail(c, 404, "That dump no longer exists.");
  const { results: assets } = await c.env.DB.prepare(
    "SELECT id, dump_id, file_name, mime_type, size_bytes, upload_status, file_note, original_platform, original_posted_at, original_views FROM assets WHERE dump_id = ? ORDER BY created_at",
  )
    .bind(row.id)
    .all<AssetRow>();
  return c.json({ dump: view(row), assets });
});

/** "This is my video": she confirms a held video is her own; its clips may go on the calendar. */
dumps.post("/:id/mine", async (c) => {
  const r = await c.env.DB.prepare("UPDATE assets SET source_owner = 'confirmed' WHERE dump_id = ? AND source_owner = 'other'").bind(c.req.param("id")).run();
  if (!r.meta.changes) return fail(c, 404, "Nothing on this dump is waiting for that.");
  await recordEvent(c.env.DB, "dump.source_confirmed", c.req.param("id"), { videos: r.meta.changes }, c.get("user").email);
  return c.json({ ok: true, videos: r.meta.changes });
});

dumps.patch("/:id", async (c) => {
  const body = await readJson<{ notes?: string }>(c);
  await c.env.DB.prepare("UPDATE dumps SET notes = ? WHERE id = ? AND status = 'uploading'").bind((body?.notes ?? "").slice(0, 4000), c.req.param("id")).run();
  return c.json({ ok: true });
});

/** Per-file details (note, and for recycle: where/when it was posted and rough views). */
dumps.patch("/:id/assets/:assetId", async (c) => {
  const body = await readJson<{ fileNote?: string; originalPlatform?: string; originalPostedAt?: string; originalViews?: number }>(c);
  await c.env.DB.prepare(
    "UPDATE assets SET file_note = COALESCE(?, file_note), original_platform = COALESCE(?, original_platform), original_posted_at = COALESCE(?, original_posted_at), original_views = COALESCE(?, original_views) WHERE id = ? AND dump_id = ?",
  )
    .bind(body?.fileNote ?? null, body?.originalPlatform ?? null, body?.originalPostedAt ?? null, body?.originalViews ?? null, c.req.param("assetId"), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

dumps.delete("/:id/assets/:assetId", async (c) => {
  const asset = await c.env.DB.prepare("SELECT r2_key, upload_id FROM assets WHERE id = ? AND dump_id = ?").bind(c.req.param("assetId"), c.req.param("id")).first<{ r2_key: string; upload_id: string | null }>();
  if (!asset) return fail(c, 404, "That file is not in this dump.");
  if (asset.upload_id) {
    try {
      await c.env.FILES.resumeMultipartUpload(asset.r2_key, asset.upload_id).abort();
    } catch {
      /* already gone */
    }
  } else {
    await c.env.FILES.delete(asset.r2_key);
  }
  await c.env.DB.prepare("DELETE FROM assets WHERE id = ?").bind(c.req.param("assetId")).run();
  return c.json({ ok: true });
});

/** The Dump button. Requires at least one uploaded file; queues the cut job. */
dumps.post("/:id/dump", async (c) => {
  const id = c.req.param("id");
  const dump = await c.env.DB.prepare("SELECT id, status, door FROM dumps WHERE id = ?").bind(id).first<{ id: string; status: string; door: string }>();
  if (!dump) return fail(c, 404, "That dump no longer exists.");
  if (dump.status !== "uploading") return fail(c, 409, "This dump was already sent.");
  const counts = await c.env.DB.prepare(
    "SELECT SUM(CASE WHEN upload_status = 'uploaded' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN upload_status = 'uploading' THEN 1 ELSE 0 END) AS pending FROM assets WHERE dump_id = ?",
  )
    .bind(id)
    .first<{ done: number; pending: number }>();
  if (!counts?.done) return fail(c, 422, "Add at least one video first.");
  if (counts.pending) return fail(c, 409, "Some videos are still uploading. Keep the page open until they finish.");

  const gate = await briefGate(c.env);
  if (gate) return fail(c, 409, gate.message, gate.fix_guide);

  await c.env.DB.prepare("UPDATE dumps SET status = 'queued', dumped_at = ? WHERE id = ?").bind(nowIso(), id).run();
  const r = await dispatchJob(c.env, "cut", id);
  if (!r.dispatched) {
    await c.env.DB.prepare("UPDATE dumps SET status = 'failed', error_summary = ? WHERE id = ?").bind(r.error, id).run();
    return fail(c, 502, r.error ?? "The cutting job could not start.", "clips-look-wrong");
  }
  await c.env.DB.prepare("UPDATE dumps SET status = 'cutting' WHERE id = ?").bind(id).run();
  await recordEvent(c.env.DB, "dump.sent", id, { door: dump.door, files: counts.done }, c.get("user").email);
  log.info("dump.sent", { files: counts.done });
  return c.json({ ok: true, jobId: r.jobId });
});

/**
 * Section 6 gate: no clips are cut until a Research Brief exists and is approved, and the
 * Brand Profile is locked. Returns null when the gate is open.
 */
export async function briefGate(env: Env): Promise<{ message: string; fix_guide: string } | null> {
  const profile = await env.DB.prepare("SELECT version FROM brand_profile WHERE locked = 1 ORDER BY version DESC LIMIT 1").first();
  if (!profile) return { message: "Lock your Brand Profile first, so the clips sound like you.", fix_guide: "upload-brand-docs" };
  const brief = await env.DB.prepare("SELECT version FROM research_briefs WHERE status = 'approved' ORDER BY version DESC LIMIT 1").first();
  if (!brief) return { message: "Approve your Research Brief first. It tells the cutter what to look for.", fix_guide: "approve-research-brief" };
  return null;
}
