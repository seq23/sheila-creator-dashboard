// The Worker side of every GitHub Actions job (section 13):
//   GET  /api/jobs/:id/spec       job → Worker, signed: everything the job needs (ids, R2 keys,
//                                 locked Brand Profile, approved brief, notes). Never logged.
//   POST /api/jobs/:id/progress   job → Worker, signed: {step, done, total}
//   POST /api/jobs/:id/callback   job → Worker, signed: the result (clips, extracted text, brief…)
//   GET  /api/jobs                user: recent jobs for the Health panel
// Each job type has a handler in worker/jobs/<type>.ts that builds the spec and applies the result.
import { Hono, type Context } from "hono";
import type { Env, Vars } from "../env";
import { verifyJobMessage } from "../lib/crypto";
import { fail, readJson } from "../lib/http";
import { nowIso } from "../lib/ids";
import { log, safeError } from "../lib/log";
import { markJob } from "../services/github";
import { requireUser } from "../lib/auth";
import { parseJson } from "../lib/db";
import type { JobRow } from "@shared/types";
import { JOB_HANDLERS } from "../jobs/registry";

export const jobs = new Hono<{ Bindings: Env; Variables: Vars }>();

interface JobDb {
  id: string;
  type: JobRow["type"];
  status: JobRow["status"];
  ref_id: string | null;
  nonce: string;
}

type C = Context<{ Bindings: Env; Variables: Vars }, "/:id/spec" | "/:id/progress" | "/:id/callback">;

async function loadSignedJob(c: C, bodyText: string): Promise<JobDb | Response> {
  const ok = await verifyJobMessage(c.env.JOB_SHARED_SECRET, bodyText, c.req.header("x-job-timestamp") ?? null, c.req.header("x-job-signature") ?? null);
  if (!ok) return fail(c, 401, "Bad job signature.");
  const id = c.req.param("id");
  const job = await c.env.DB.prepare("SELECT id, type, status, ref_id, nonce FROM jobs WHERE id = ?").bind(id).first<JobDb>();
  if (!job) return fail(c, 404, "No such job.");
  const nonce = c.req.header("x-job-nonce");
  if (nonce !== job.nonce) return fail(c, 401, "Bad job nonce.");
  return job;
}

jobs.get("/:id/spec", async (c) => {
  const job = await loadSignedJob(c, `spec:${c.req.param("id")}`);
  if (job instanceof Response) return job;
  const handler = JOB_HANDLERS[job.type];
  if (!handler) return fail(c, 422, "This job type has no handler yet.");
  await markJob(c.env, job.id, "running", null, c.req.header("x-job-run-id") ?? null);
  const spec = await handler.buildSpec(c.env, job.id, job.ref_id);
  log.info("job.spec", { type: job.type });
  return c.json(spec);
});

jobs.post("/:id/progress", async (c) => {
  const text = await c.req.text();
  const job = await loadSignedJob(c, text);
  if (job instanceof Response) return job;
  const body = parseJson<{ step?: string; done?: number; total?: number }>(text, {});
  const progress = { step: String(body.step ?? "working"), done: Number(body.done ?? 0), total: Number(body.total ?? 0) };
  await c.env.DB.prepare("UPDATE jobs SET progress = ? WHERE id = ?").bind(JSON.stringify(progress), job.id).run();
  const handler = JOB_HANDLERS[job.type];
  if (handler?.onProgress) await handler.onProgress(c.env, job.id, job.ref_id, progress);
  return c.json({ ok: true });
});

jobs.post("/:id/callback", async (c) => {
  const text = await c.req.text();
  const job = await loadSignedJob(c, text);
  if (job instanceof Response) return job;
  if (job.status === "done") return c.json({ ok: true, already: true });
  const body = parseJson<{ ok?: boolean; safe_error?: string; result?: unknown }>(text, {});
  const handler = JOB_HANDLERS[job.type];
  if (!handler) return fail(c, 422, "This job type has no handler yet.");
  try {
    if (body.ok === false) {
      await markJob(c.env, job.id, "failed", String(body.safe_error ?? "job failed").slice(0, 160));
      await handler.onFailure(c.env, job.id, job.ref_id, String(body.safe_error ?? "job failed"));
      log.warn("job.failed", { type: job.type });
      return c.json({ ok: true });
    }
    await handler.applyResult(c.env, job.id, job.ref_id, body.result);
    await markJob(c.env, job.id, "done");
    log.info("job.done", { type: job.type });
    return c.json({ ok: true });
  } catch (e) {
    const err = safeError(e);
    await markJob(c.env, job.id, "failed", err);
    await handler.onFailure(c.env, job.id, job.ref_id, err);
    log.error("job.apply", { type: job.type });
    return fail(c, 500, "The dashboard could not save the job result.");
  }
});

jobs.get("/", requireUser, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, type, status, ref_id, safe_error, progress, created_at, finished_at FROM jobs ORDER BY created_at DESC LIMIT 50").all<
    Omit<JobRow, "progress"> & { progress: string | null }
  >();
  return c.json(results.map((r) => ({ ...r, progress: parseJson(r.progress, null) })));
});

/** Local-only helper: with FAKE_SERVICES=1 a job can be "run" instantly by the fake runner. */
jobs.post("/:id/run-fake", requireUser, async (c) => {
  if (c.env.FAKE_SERVICES !== "1") return fail(c, 403, "Only available with fake services.");
  const job = await c.env.DB.prepare("SELECT id, type, status, ref_id, nonce FROM jobs WHERE id = ?").bind(c.req.param("id")).first<JobDb>();
  if (!job) return fail(c, 404, "No such job.");
  const handler = JOB_HANDLERS[job.type];
  if (!handler?.fakeRun) return fail(c, 422, "No fake runner for this job type.");
  const body = await readJson<Record<string, unknown>>(c);
  await markJob(c.env, job.id, "running");
  const result = await handler.fakeRun(c.env, job.id, job.ref_id, body ?? {});
  await handler.applyResult(c.env, job.id, job.ref_id, result);
  await markJob(c.env, job.id, "done");
  await c.env.DB.prepare("UPDATE jobs SET finished_at = ? WHERE id = ?").bind(nowIso(), job.id).run();
  return c.json({ ok: true });
});
