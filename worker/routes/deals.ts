// Brand deals (section 12b): brand cards with fit reasons, public contacts with the page they
// were found on, pitch drafts she sends herself (Open in Gmail / Copy; the dashboard never
// sends), the deal tracker with follow-ups, deliverables on won deals, and TikTok One
// eligibility.
//   GET    /api/deals                       cards + stage counts + marketplace + finder status
//   POST   /api/deals/brands                a brand she uses and loves (origin her_list)
//   PATCH  /api/deals/brands/:id            save / hide / back to suggested
//   POST   /api/deals/brands/:id/contacts   add a public contact she found (with its page)
//   DELETE /api/deals/brands/:id/contacts/:cid
//   POST   /api/deals/brands/:id/pitch      draft (or redraft) subject, email, DM, follow-ups
//   PATCH  /api/deals/pitches/:id           her edits
//   POST   /api/deals/pitches/:id/sent      she sent it: status sent, day-5 follow-up, stage → sent
//   POST   /api/deals/pitches/:id/followup-sent   she sent the follow-up that was due
//   POST   /api/deals/deals/:id/stage       move along the funnel (canMove)
//   POST   /api/deals/deals/:id/reply       they replied: stage replied, follow-ups stop
//   PATCH  /api/deals/deals/:id             terms note, paid-partnership flag
//   POST/PATCH/DELETE /api/deals/deals/:id/deliverables[/:did]   won deals only
//   POST   /api/deals/finder/run            start the weekly brand finder now
import { Hono, type Context } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { parseJson, recordEvent } from "../lib/db";
import { fail, readJson } from "../lib/http";
import { newId, nowIso } from "../lib/ids";
import { log } from "../lib/log";
import { getConnectionSecret, listConnections } from "../lib/connections";
import { canMove, nextFollowup } from "../domain/deals";
import { afterFollowupSent, brandKey, contactProblem, sortContacts, validSentAt, type ContactKind } from "../domain/brandfit";
import { tiktokOneEligibility, views30d } from "../domain/marketplace";
import { parsePitch, pitchPrompt, starterPitch, type PitchInput } from "../domain/pitch";
import { dispatchJob } from "../services/github";
import { getLlm } from "../services/openrouter";
import { KIT_NAME, latestAccountStats, lockedProfile, readKit, themeList, audienceLine } from "./mediakit";
import { DEAL_STAGES, PLATFORMS, type DealStage, type Platform } from "@shared/constants";
import type { BrandCard, PitchView } from "@shared/types";

export const deals = new Hono<{ Bindings: Env; Variables: Vars }>();
deals.use("*", requireUser);

type C = Context<{ Bindings: Env; Variables: Vars }>;

// ---------- reading

interface BrandDb {
  id: string;
  name: string;
  website: string | null;
  program_url: string | null;
  socials: string;
  fit_score: number;
  fit_reasons: string;
  why_now: string | null;
  source_links: string;
  origin: BrandCard["origin"];
  status: BrandCard["status"];
}
interface PitchDb {
  id: string;
  brand_id: string;
  contact_id: string | null;
  subject: string;
  body: string;
  dm_text: string;
  followup_1: string;
  followup_2: string;
  clip_links: string;
  status: PitchView["status"];
  sent_at: string | null;
  next_followup_at: string | null;
}
interface DealDb {
  id: string;
  brand_id: string;
  stage: DealStage;
  terms_note: string;
  deliverables: string;
  paid_partnership: number;
}

export interface Deliverable {
  id: string;
  clip_id: string | null;
  platform: Platform;
  due_at: string;
  note: string;
  done: boolean;
}

function pitchView(p: PitchDb): PitchView {
  return { ...p, clip_links: parseJson<string[]>(p.clip_links, []) };
}

async function latestPitch(env: Env, brandId: string): Promise<PitchDb | null> {
  return env.DB.prepare(
    "SELECT id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status, sent_at, next_followup_at FROM pitches WHERE brand_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(brandId)
    .first<PitchDb>();
}

async function dealFor(env: Env, brandId: string): Promise<DealDb | null> {
  return env.DB.prepare("SELECT id, brand_id, stage, terms_note, deliverables, paid_partnership FROM deals WHERE brand_id = ? ORDER BY created_at DESC LIMIT 1").bind(brandId).first<DealDb>();
}

async function card(env: Env, b: BrandDb): Promise<BrandCard & { deal_detail: { terms_note: string; deliverables: Deliverable[]; paid_partnership: boolean } | null }> {
  const { results: contacts } = await env.DB.prepare("SELECT id, kind, value, found_on_url FROM brand_contacts WHERE brand_id = ? ORDER BY checked_at").bind(b.id).all<{
    id: string;
    kind: ContactKind;
    value: string;
    found_on_url: string;
  }>();
  const pitch = await latestPitch(env, b.id);
  const deal = await dealFor(env, b.id);
  return {
    id: b.id,
    name: b.name,
    website: b.website,
    program_url: b.program_url,
    socials: parseJson<Record<string, string>>(b.socials, {}),
    fit_score: b.fit_score,
    fit_reasons: parseJson<string[]>(b.fit_reasons, []),
    why_now: b.why_now,
    source_links: parseJson<string[]>(b.source_links, []),
    origin: b.origin,
    status: b.status,
    contacts: sortContacts(contacts),
    deal: deal ? { id: deal.id, stage: deal.stage, next_followup_at: pitch?.next_followup_at ?? null } : null,
    pitch: pitch ? pitchView(pitch) : null,
    deal_detail: deal ? { terms_note: deal.terms_note, deliverables: parseJson<Deliverable[]>(deal.deliverables, []), paid_partnership: !!deal.paid_partnership } : null,
  };
}

async function brandById(env: Env, id: string): Promise<BrandDb | null> {
  return env.DB.prepare("SELECT id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status FROM brands WHERE id = ?").bind(id).first<BrandDb>();
}

async function marketplace(env: Env) {
  const tt = await env.DB.prepare("SELECT followers, avg_views FROM account_stats WHERE platform = 'tiktok' ORDER BY captured_at DESC LIMIT 1").first<{ followers: number; avg_views: number }>();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const recent = (await env.DB.prepare("SELECT COUNT(*) AS n FROM posts WHERE platform = 'tiktok' AND status = 'posted' AND posted_at >= ?").bind(since).first<{ n: number }>())?.n ?? 0;
  const { results: perPost } = await env.DB.prepare(
    "SELECT (SELECT m.views FROM metrics m WHERE m.post_id = p.id ORDER BY m.captured_at DESC LIMIT 1) AS views FROM posts p WHERE p.platform = 'tiktok' AND p.status = 'posted' AND p.posted_at >= ?",
  )
    .bind(since)
    .all<{ views: number | null }>();
  const latest = perPost.map((r) => r.views).filter((v): v is number => typeof v === "number");
  return tiktokOneEligibility({ followers: tt ? tt.followers : null, views30d: tt ? views30d(latest, tt.avg_views, recent) : null, recentPosts: tt ? recent : null });
}

deals.get("/", async (c) => {
  const showHidden = c.req.query("hidden") === "1";
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, origin, status FROM brands
     ${showHidden ? "" : "WHERE status != 'hidden'"}
     ORDER BY CASE status WHEN 'saved' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END, CASE origin WHEN 'her_list' THEN 0 ELSE 1 END, fit_score DESC, created_at DESC LIMIT 200`,
  ).all<BrandDb>();
  const brands = [];
  for (const b of results) brands.push(await card(c.env, b));

  const stages = Object.fromEntries(DEAL_STAGES.map((s) => [s, 0])) as Record<DealStage, number>;
  for (const b of brands) {
    if (b.status === "hidden" && !b.deal) continue;
    stages[b.deal?.stage ?? "found"]++;
  }
  const kit = await readKit(c.env);
  const job = await c.env.DB.prepare("SELECT status, created_at, finished_at, safe_error FROM jobs WHERE type = 'brand_finder' ORDER BY created_at DESC LIMIT 1").first<{
    status: string;
    created_at: string;
    finished_at: string | null;
    safe_error: string | null;
  }>();
  const conns = await listConnections(c.env);
  const hunter = conns.find((x) => x.service === "hunter");
  return c.json({
    brands,
    stages,
    marketplace: await marketplace(c.env),
    kit_url: `${c.env.PUBLIC_BASE_URL}/kit/${kit.public_slug}`,
    kit_path: `/kit/${kit.public_slug}`,
    profile_locked: !!(await lockedProfile(c.env)),
    finder: job
      ? { status: job.status, started_at: job.created_at, finished_at: job.finished_at, running: ["queued", "dispatched", "running"].includes(job.status), error: job.safe_error }
      : { status: "never", started_at: null, finished_at: null, running: false, error: null },
    hunter: { connected: hunter?.status === "ok", credits_left: (hunter?.meta.credits_left as number | undefined) ?? null },
  });
});

// ---------- brands

deals.post("/brands", async (c) => {
  const body = await readJson<{ name?: string; website?: string; program_url?: string; note?: string }>(c);
  const name = body?.name?.trim();
  if (!name || name.length > 80) return fail(c, 400, "Type the brand's name.", "send-a-pitch");
  const website = normUrl(body?.website);
  if (body?.website && !website) return fail(c, 422, "That website does not look right. Try something like brand.com.", "send-a-pitch");
  const program = normUrl(body?.program_url);
  const key = brandKey({ name, website });
  const { results: existing } = await c.env.DB.prepare("SELECT id, name, website FROM brands").all<{ id: string; name: string; website: string | null }>();
  const dup = existing.find((b) => brandKey(b) === key);
  if (dup) {
    await c.env.DB.prepare("UPDATE brands SET status = 'saved', origin = 'her_list' WHERE id = ?").bind(dup.id).run();
    return c.json({ id: dup.id, existed: true });
  }
  const id = newId("brd");
  const reasons = ["You use and love this brand (strongest pitches)."];
  if (body?.note?.trim()) reasons.push(body.note.trim().slice(0, 200));
  await c.env.DB.prepare("INSERT INTO brands (id, name, website, program_url, fit_score, fit_reasons, origin, status) VALUES (?, ?, ?, ?, 0.9, ?, 'her_list', 'saved')")
    .bind(id, name, website, program, JSON.stringify(reasons))
    .run();
  await recordEvent(c.env.DB, "brand.added", id, { origin: "her_list" }, c.get("user").email);
  log.info("deals.brand.added");
  return c.json({ id });
});

deals.patch("/brands/:id", async (c) => {
  const body = await readJson<{ status?: BrandCard["status"] }>(c);
  if (!body?.status || !["suggested", "saved", "hidden"].includes(body.status)) return fail(c, 400, "Pick save or hide.");
  const r = await c.env.DB.prepare("UPDATE brands SET status = ? WHERE id = ?").bind(body.status, c.req.param("id")).run();
  if (!r.meta.changes) return fail(c, 404, "That brand is gone.");
  await recordEvent(c.env.DB, `brand.${body.status}`, c.req.param("id"), {}, c.get("user").email);
  return c.json({ ok: true });
});

deals.post("/brands/:id/contacts", async (c) => {
  const brand = await brandById(c.env, c.req.param("id"));
  if (!brand) return fail(c, 404, "That brand is gone.");
  const body = await readJson<{ kind?: ContactKind; value?: string; found_on_url?: string }>(c);
  const cand = { kind: body?.kind ?? "role_email", value: (body?.value ?? "").trim(), found_on_url: normUrl(body?.found_on_url) ?? "" };
  const problem = contactProblem(cand);
  if (problem) return fail(c, 422, problem, "send-a-pitch");
  const id = newId("bct");
  await c.env.DB.prepare("INSERT INTO brand_contacts (id, brand_id, kind, value, found_on_url) VALUES (?, ?, ?, ?, ?)").bind(id, brand.id, cand.kind, cand.value, cand.found_on_url).run();
  return c.json({ id });
});

deals.delete("/brands/:id/contacts/:cid", async (c) => {
  await c.env.DB.prepare("DELETE FROM brand_contacts WHERE id = ? AND brand_id = ?").bind(c.req.param("cid"), c.req.param("id")).run();
  return c.json({ ok: true });
});

// ---------- pitches

async function ensureDeal(env: Env, brandId: string): Promise<DealDb> {
  const d = await dealFor(env, brandId);
  if (d) return d;
  const id = newId("dl");
  await env.DB.prepare("INSERT INTO deals (id, brand_id, stage) VALUES (?, ?, 'found')").bind(id, brandId).run();
  return { id, brand_id: brandId, stage: "found", terms_note: "", deliverables: "[]", paid_partnership: 1 };
}

async function setStage(env: Env, dealId: string, stage: DealStage) {
  await env.DB.prepare("UPDATE deals SET stage = ?, updated_at = ? WHERE id = ?").bind(stage, nowIso(), dealId).run();
}

async function pitchInput(env: Env, brand: BrandDb, contactKind: ContactKind | null): Promise<PitchInput | null> {
  const profile = await lockedProfile(env);
  if (!profile) return null;
  const kit = await readKit(env);
  const featured = parseJson<string[]>(kit.featured_clip_ids, []);
  const { results: clips } = await env.DB.prepare("SELECT id, media_token FROM clips WHERE status = 'approved' AND media_token IS NOT NULL ORDER BY score DESC LIMIT 20").all<{ id: string; media_token: string }>();
  const ordered = [...clips.filter((x) => featured.includes(x.id)), ...clips.filter((x) => !featured.includes(x.id))];
  return {
    creatorName: KIT_NAME,
    voice: profile.voice ?? "",
    audience: audienceLine(profile.audience),
    themes: themeList(profile.themes),
    dealFit: profile.deal_fit ?? "",
    brand: { name: brand.name, website: brand.website, why_now: brand.why_now, fit_reasons: parseJson<string[]>(brand.fit_reasons, []), product: null, herPick: brand.origin === "her_list" },
    numbers: await latestAccountStats(env),
    clipLinks: ordered.slice(0, 2).map((x) => `${env.PUBLIC_BASE_URL}/media/${x.media_token}`),
    mediaKitUrl: `${env.PUBLIC_BASE_URL}/kit/${kit.public_slug}`,
    contactKind,
  };
}

deals.post("/brands/:id/pitch", async (c) => {
  const brand = await brandById(c.env, c.req.param("id"));
  if (!brand) return fail(c, 404, "That brand is gone.");
  const body = await readJson<{ contact_id?: string }>(c);
  const { results: contacts } = await c.env.DB.prepare("SELECT id, kind FROM brand_contacts WHERE brand_id = ?").bind(brand.id).all<{ id: string; kind: ContactKind }>();
  const contact = (body?.contact_id ? contacts.find((x) => x.id === body.contact_id) : sortContacts(contacts)[0]) ?? null;

  const existing = await latestPitch(c.env, brand.id);
  if (existing && existing.status !== "drafted") return fail(c, 409, "You already sent a pitch to this brand. Mark their reply, or pass on it.", "mark-a-reply");

  const input = await pitchInput(c.env, brand, contact?.kind ?? null);
  if (!input) return fail(c, 409, "Lock your Brand Profile first, so pitches sound like you.", "upload-brand-docs");

  let draft = starterPitch(input);
  let note: string | null = null;
  if (!c.get("fake")) {
    const llm = await getLlm(c.env);
    const { system, user } = pitchPrompt(input);
    const r = await llm.complete({ system, user, json: true, maxTokens: 900, accept: (t) => !!parsePitch(t, input) });
    const parsed = r.ok ? parsePitch(r.text, input) : null;
    if (parsed) draft = parsed;
    else {
      note = "The free AI model is busy, so this is a starter draft in your words. Edit anything, or try Redraft in a minute.";
      log.warn("deals.pitch.fallback", { ok: r.ok });
    }
  }

  const deal = await ensureDeal(c.env, brand.id);
  let pitchId: string;
  if (existing) {
    pitchId = existing.id;
    await c.env.DB.prepare("UPDATE pitches SET contact_id = ?, subject = ?, body = ?, dm_text = ?, followup_1 = ?, followup_2 = ?, clip_links = ? WHERE id = ?")
      .bind(contact?.id ?? null, draft.subject, draft.body, draft.dm_text, draft.followup_1, draft.followup_2, JSON.stringify(input.clipLinks), pitchId)
      .run();
  } else {
    pitchId = newId("pch");
    await c.env.DB.prepare("INSERT INTO pitches (id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'drafted')")
      .bind(pitchId, brand.id, contact?.id ?? null, draft.subject, draft.body, draft.dm_text, draft.followup_1, draft.followup_2, JSON.stringify(input.clipLinks))
      .run();
  }
  if (deal.stage === "found") await setStage(c.env, deal.id, "drafted");
  if (brand.status === "suggested") await c.env.DB.prepare("UPDATE brands SET status = 'saved' WHERE id = ?").bind(brand.id).run();
  await recordEvent(c.env.DB, "pitch.drafted", pitchId, { redraft: !!existing, fallback: !!note }, c.get("user").email);
  log.info("deals.pitch.drafted", { redraft: !!existing });
  const saved = await latestPitch(c.env, brand.id);
  return c.json({ pitch: pitchView(saved!), note });
});

async function pitchById(env: Env, id: string): Promise<PitchDb | null> {
  return env.DB.prepare("SELECT id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status, sent_at, next_followup_at FROM pitches WHERE id = ?").bind(id).first<PitchDb>();
}

deals.patch("/pitches/:id", async (c) => {
  const p = await pitchById(c.env, c.req.param("id"));
  if (!p) return fail(c, 404, "That pitch is gone.");
  const body = await readJson<Partial<Pick<PitchDb, "subject" | "body" | "dm_text" | "followup_1" | "followup_2" | "contact_id">>>(c);
  if (!body) return fail(c, 400, "Nothing to save.");
  const next = { ...p };
  for (const k of ["subject", "body", "dm_text", "followup_1", "followup_2"] as const) {
    if (body[k] === undefined) continue;
    const v = String(body[k]);
    if (v.length > (k === "subject" ? 200 : 5000)) return fail(c, 422, "That is too long for one pitch.");
    next[k] = v;
  }
  if (body.contact_id !== undefined) {
    if (body.contact_id) {
      const ok = await c.env.DB.prepare("SELECT id FROM brand_contacts WHERE id = ? AND brand_id = ?").bind(body.contact_id, p.brand_id).first();
      if (!ok) return fail(c, 422, "That contact is not on this brand.");
    }
    next.contact_id = body.contact_id || null;
  }
  await c.env.DB.prepare("UPDATE pitches SET subject = ?, body = ?, dm_text = ?, followup_1 = ?, followup_2 = ?, contact_id = ? WHERE id = ?")
    .bind(next.subject, next.body, next.dm_text, next.followup_1, next.followup_2, next.contact_id, p.id)
    .run();
  return c.json({ pitch: pitchView(next) });
});

async function markSent(c: C, p: PitchDb, sentAtInput: string | null | undefined) {
  const sentAt = validSentAt(sentAtInput, new Date());
  if (!sentAt) return fail(c, 422, "Pick the day you sent it: today or up to 60 days ago.", "send-a-pitch");
  if (p.status !== "drafted") return fail(c, 409, "This pitch is already marked as sent.", "mark-a-reply");
  // Follow-ups whose day already passed are still due now: keep the earliest one not yet sent.
  const next = nextFollowup(sentAt, 0);
  await c.env.DB.prepare("UPDATE pitches SET status = 'sent', sent_at = ?, next_followup_at = ? WHERE id = ?").bind(sentAt, next, p.id).run();
  const deal = await ensureDeal(c.env, p.brand_id);
  if (deal.stage === "found" || deal.stage === "drafted") await setStage(c.env, deal.id, "sent");
  await recordEvent(c.env.DB, "pitch.sent", p.id, {}, c.get("user").email);
  log.info("deals.pitch.sent");
  return c.json({ ok: true, sent_at: sentAt, next_followup_at: next });
}

deals.post("/pitches/:id/sent", async (c) => {
  const p = await pitchById(c.env, c.req.param("id"));
  if (!p) return fail(c, 404, "That pitch is gone.");
  const body = await readJson<{ sent_at?: string }>(c);
  return markSent(c, p, body?.sent_at);
});

deals.post("/pitches/:id/followup-sent", async (c) => {
  const p = await pitchById(c.env, c.req.param("id"));
  if (!p) return fail(c, 404, "That pitch is gone.");
  if (p.status !== "sent" || !p.sent_at) return fail(c, 409, "Mark the pitch as sent first.", "send-a-pitch");
  const next = afterFollowupSent(p.sent_at, p.next_followup_at);
  await c.env.DB.prepare("UPDATE pitches SET next_followup_at = ? WHERE id = ?").bind(next, p.id).run();
  await recordEvent(c.env.DB, "pitch.followup_sent", p.id, { more: !!next }, c.get("user").email);
  return c.json({ ok: true, next_followup_at: next });
});

// ---------- deal tracker

async function dealById(env: Env, id: string): Promise<DealDb | null> {
  return env.DB.prepare("SELECT id, brand_id, stage, terms_note, deliverables, paid_partnership FROM deals WHERE id = ?").bind(id).first<DealDb>();
}

async function markReplied(c: C, deal: DealDb) {
  const p = await latestPitch(c.env, deal.brand_id);
  if (p) await c.env.DB.prepare("UPDATE pitches SET status = 'replied', next_followup_at = NULL WHERE id = ?").bind(p.id).run();
  if (canMove(deal.stage, "replied")) await setStage(c.env, deal.id, "replied");
  else if (deal.stage !== "replied" && deal.stage !== "negotiating" && deal.stage !== "won") return fail(c, 409, "Mark the pitch as sent first.", "mark-a-reply");
  await recordEvent(c.env.DB, "deal.replied", deal.id, {}, c.get("user").email);
  return c.json({ ok: true });
}

deals.post("/deals/:id/reply", async (c) => {
  const deal = await dealById(c.env, c.req.param("id"));
  if (!deal) return fail(c, 404, "That deal is gone.");
  return markReplied(c, deal);
});

deals.post("/deals/:id/stage", async (c) => {
  const deal = await dealById(c.env, c.req.param("id"));
  if (!deal) return fail(c, 404, "That deal is gone.");
  const body = await readJson<{ stage?: DealStage; sent_at?: string }>(c);
  const to = body?.stage;
  if (!to || !DEAL_STAGES.includes(to)) return fail(c, 400, "Pick a stage.");
  if (!canMove(deal.stage, to)) return fail(c, 409, `A deal can't go from ${deal.stage} straight to ${to}.`, "mark-a-reply");
  const p = await latestPitch(c.env, deal.brand_id);
  if (to === "sent") {
    if (!p) return fail(c, 409, "Draft the pitch first.", "send-a-pitch");
    return markSent(c, p, body?.sent_at);
  }
  if (to === "replied") return markReplied(c, deal);
  await setStage(c.env, deal.id, to);
  if (p && (to === "won" || to === "passed" || to === "negotiating")) {
    await c.env.DB.prepare("UPDATE pitches SET next_followup_at = NULL, status = ? WHERE id = ?").bind(to === "passed" ? "closed" : p.status === "drafted" ? "drafted" : "replied", p.id).run();
  }
  if (to === "passed") await c.env.DB.prepare("UPDATE brands SET status = 'hidden' WHERE id = ?").bind(deal.brand_id).run();
  await recordEvent(c.env.DB, `deal.${to}`, deal.id, { from: deal.stage }, c.get("user").email);
  log.info("deals.stage", { to });
  return c.json({ ok: true });
});

deals.patch("/deals/:id", async (c) => {
  const deal = await dealById(c.env, c.req.param("id"));
  if (!deal) return fail(c, 404, "That deal is gone.");
  const body = await readJson<{ terms_note?: string; paid_partnership?: boolean }>(c);
  const note = body?.terms_note !== undefined ? String(body.terms_note).slice(0, 2000) : deal.terms_note;
  const paid = body?.paid_partnership !== undefined ? (body.paid_partnership ? 1 : 0) : deal.paid_partnership;
  await c.env.DB.prepare("UPDATE deals SET terms_note = ?, paid_partnership = ?, updated_at = ? WHERE id = ?").bind(note, paid, nowIso(), deal.id).run();
  await syncPaidClips(c.env, { ...deal, paid_partnership: paid });
  return c.json({ ok: true });
});

/** A clip delivered for a paid deal is flagged Paid partnership in Review (#ad + platform label reminder). */
async function syncPaidClips(env: Env, deal: DealDb) {
  const items = parseJson<Deliverable[]>(deal.deliverables, []);
  const ids = items.map((d) => d.clip_id).filter((x): x is string => !!x);
  await env.DB.prepare("UPDATE clips SET paid_partnership = 0, deal_id = NULL WHERE deal_id = ?").bind(deal.id).run();
  for (const id of ids) await env.DB.prepare("UPDATE clips SET paid_partnership = ?, deal_id = ? WHERE id = ?").bind(deal.paid_partnership ? 1 : 0, deal.id, id).run();
}

function validDeliverable(d: Partial<Deliverable>): string | null {
  if (!d.platform || !PLATFORMS.includes(d.platform)) return "Pick TikTok, Instagram or YouTube.";
  if (!d.due_at || Number.isNaN(new Date(d.due_at).getTime())) return "Pick a due date.";
  if (d.note && d.note.length > 300) return "Keep the note short.";
  return null;
}

async function saveDeliverables(env: Env, deal: DealDb, items: Deliverable[]) {
  const json = JSON.stringify(items);
  await env.DB.prepare("UPDATE deals SET deliverables = ?, updated_at = ? WHERE id = ?").bind(json, nowIso(), deal.id).run();
  await syncPaidClips(env, { ...deal, deliverables: json });
}

async function wonDeal(c: C): Promise<DealDb | Response> {
  const deal = await dealById(c.env, c.req.param("id")!);
  if (!deal) return fail(c, 404, "That deal is gone.");
  if (deal.stage !== "won") return fail(c, 409, "Deliverables are for won deals. Mark the deal as won first.", "mark-a-paid-partnership");
  return deal;
}

async function checkClip(env: Env, clipId: string | null | undefined): Promise<boolean> {
  if (!clipId) return true;
  return !!(await env.DB.prepare("SELECT id FROM clips WHERE id = ? AND status IN ('draft','approved')").bind(clipId).first());
}

deals.post("/deals/:id/deliverables", async (c) => {
  const deal = await wonDeal(c);
  if (deal instanceof Response) return deal;
  const body = await readJson<Partial<Deliverable>>(c);
  const problem = validDeliverable(body ?? {});
  if (problem) return fail(c, 422, problem, "mark-a-paid-partnership");
  if (!(await checkClip(c.env, body?.clip_id))) return fail(c, 422, "That clip is not available.", "mark-a-paid-partnership");
  const items = parseJson<Deliverable[]>(deal.deliverables, []);
  const d: Deliverable = { id: newId("dv", 8), clip_id: body!.clip_id ?? null, platform: body!.platform!, due_at: new Date(body!.due_at!).toISOString(), note: (body!.note ?? "").trim(), done: false };
  items.push(d);
  await saveDeliverables(c.env, deal, items);
  return c.json({ deliverable: d });
});

deals.patch("/deals/:id/deliverables/:did", async (c) => {
  const deal = await wonDeal(c);
  if (deal instanceof Response) return deal;
  const items = parseJson<Deliverable[]>(deal.deliverables, []);
  const i = items.findIndex((d) => d.id === c.req.param("did"));
  if (i < 0) return fail(c, 404, "That deliverable is gone.");
  const body = (await readJson<Partial<Deliverable>>(c)) ?? {};
  const merged: Deliverable = { ...items[i], ...body, id: items[i].id };
  const problem = validDeliverable(merged);
  if (problem) return fail(c, 422, problem, "mark-a-paid-partnership");
  if (!(await checkClip(c.env, merged.clip_id))) return fail(c, 422, "That clip is not available.", "mark-a-paid-partnership");
  merged.due_at = new Date(merged.due_at).toISOString();
  merged.done = !!merged.done;
  items[i] = merged;
  await saveDeliverables(c.env, deal, items);
  return c.json({ deliverable: merged });
});

deals.delete("/deals/:id/deliverables/:did", async (c) => {
  const deal = await wonDeal(c);
  if (deal instanceof Response) return deal;
  const items = parseJson<Deliverable[]>(deal.deliverables, []).filter((d) => d.id !== c.req.param("did"));
  await saveDeliverables(c.env, deal, items);
  return c.json({ ok: true });
});

// ---------- finder

deals.post("/finder/run", async (c) => {
  const running = await c.env.DB.prepare("SELECT id FROM jobs WHERE type = 'brand_finder' AND status IN ('queued','dispatched','running') AND created_at > ? LIMIT 1")
    .bind(new Date(Date.now() - 2 * 3600_000).toISOString())
    .first<{ id: string }>();
  if (running) return fail(c, 409, "The brand finder is already looking. New brands show up here when it finishes.", "send-a-pitch");
  if (!(await lockedProfile(c.env))) return fail(c, 409, "Lock your Brand Profile first, so the finder knows what fits you.", "upload-brand-docs");
  if (!c.get("fake") && !(await getConnectionSecret(c.env, "firecrawl"))) return fail(c, 409, "Connect web research (Firecrawl) first. The finder searches the web with it.", "connect-firecrawl");
  const r = await dispatchJob(c.env, "brand_finder", null);
  if (!r.dispatched) return fail(c, 502, r.error ?? "The brand finder could not start.", "reconnect-github");
  await recordEvent(c.env.DB, "brand_finder.started", r.jobId, {}, c.get("user").email);
  return c.json({ ok: true, jobId: r.jobId });
});

function normUrl(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
