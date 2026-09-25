// Media kit (section 12b.1): her link in every pitch. Owner view + edit here; the public page
// reads publicMediaKit() through /api/public/kit/:slug, and the one-page printable version is
// /api/public/kit/:slug/print (the browser prints it; no PDF library).
//   GET    /api/mediakit              owner view: saved fields, public preview, clips to feature
//   PATCH  /api/mediakit              bio, featured clip ids, past partners, rates, contact, slug
//   POST   /api/mediakit/photo/:uploadId   record the kit photo uploaded via uploads kind "kit_photo"
//   DELETE /api/mediakit/photo
//   GET    /api/mediakit/pdf          → the public printable page
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireUser } from "../lib/auth";
import { parseJson, recordEvent } from "../lib/db";
import { fail, isEmail, readJson } from "../lib/http";
import { nowIso } from "../lib/ids";
import { log } from "../lib/log";
import { PLATFORMS, type Platform } from "@shared/constants";
import type { BrandProfileSections, MediaKitPublic } from "@shared/types";

export const mediakit = new Hono<{ Bindings: Env; Variables: Vars }>();
mediakit.use("*", requireUser);

export const KIT_NAME = "Sheila Bruce";
const MAX_FEATURED = 3;

interface KitRow {
  bio: string;
  photo_r2_key: string | null;
  featured_clip_ids: string;
  past_partners: string;
  rates: string | null;
  public_slug: string;
  contact_email: string | null;
  updated_at: string | null;
}

export async function readKit(env: Env): Promise<KitRow> {
  const kit = await env.DB.prepare("SELECT bio, photo_r2_key, featured_clip_ids, past_partners, rates, public_slug, contact_email, updated_at FROM media_kit WHERE id = 1").first<KitRow>();
  return kit ?? { bio: "", photo_r2_key: null, featured_clip_ids: "[]", past_partners: "[]", rates: null, public_slug: "sheila", contact_email: null, updated_at: null };
}

/** The locked Brand Profile every AI step reads (section 5), or null before she locks one. */
export async function lockedProfile(env: Env): Promise<BrandProfileSections | null> {
  const row = await env.DB.prepare("SELECT sections FROM brand_profile WHERE locked = 1 ORDER BY version DESC LIMIT 1").first<{ sections: string }>();
  return row ? parseJson<BrandProfileSections | null>(row.sections, null) : null;
}

/** "Content themes (3–5)" as a list: one per line, bullet or comma. */
export function themeList(section: string | null | undefined): string[] {
  if (!section) return [];
  return section
    .split(/\n|;|•|,(?![^()]*\))/)
    .map((t) => t.replace(/^[\s\-*\d.)]+/, "").replace(/[.:]+$/, "").trim())
    .filter((t) => t.length > 1 && t.length <= 60)
    .slice(0, 5);
}

/** The audience snapshot: the first sentence or line of the profile's Audience section. */
export function audienceLine(section: string | null | undefined): string {
  if (!section) return "";
  const first = section.split(/\n/).map((s) => s.trim()).find(Boolean) ?? "";
  return first.length > 220 ? `${first.slice(0, 217).replace(/\s+\S*$/, "")}…` : first;
}

/** Latest followers + average views per platform from the stats sync. */
export async function latestAccountStats(env: Env): Promise<MediaKitPublic["platforms"]> {
  const out: MediaKitPublic["platforms"] = [];
  for (const p of PLATFORMS) {
    const r = await env.DB.prepare("SELECT followers, avg_views FROM account_stats WHERE platform = ? ORDER BY captured_at DESC LIMIT 1").bind(p).first<{ followers: number; avg_views: number }>();
    if (r) out.push({ platform: p as Platform, followers: r.followers, avg_views: r.avg_views });
  }
  return out;
}

/** Featured clips that can still be shown publicly: approved, not deleted, media link alive. */
async function featuredClips(env: Env, ids: string[]): Promise<MediaKitPublic["featured"]> {
  const out: MediaKitPublic["featured"] = [];
  for (const id of ids.slice(0, MAX_FEATURED)) {
    const c = await env.DB.prepare("SELECT id, hook_text, media_token, cover_r2_key FROM clips WHERE id = ? AND status = 'approved' AND media_token IS NOT NULL").bind(id).first<{
      id: string;
      hook_text: string;
      media_token: string;
      cover_r2_key: string | null;
    }>();
    if (c) out.push({ id: c.id, hook_text: c.hook_text, media_url: `/media/${c.media_token}`, cover_url: c.cover_r2_key ? `/media/${c.media_token}?cover=1` : null });
  }
  return out;
}

export async function publicMediaKit(env: Env, slug: string): Promise<MediaKitPublic | null> {
  const kit = await readKit(env);
  if (kit.public_slug !== slug) return null;
  const profile = await lockedProfile(env);
  return {
    name: KIT_NAME,
    bio: kit.bio,
    photo_url: kit.photo_r2_key ? `/api/public/kit/${encodeURIComponent(kit.public_slug)}/photo?v=${encodeURIComponent(kit.updated_at ?? "0")}` : null,
    themes: themeList(profile?.themes),
    audience: audienceLine(profile?.audience),
    platforms: await latestAccountStats(env),
    featured: await featuredClips(env, parseJson<string[]>(kit.featured_clip_ids, [])),
    past_partners: parseJson<string[]>(kit.past_partners, []),
    rates: kit.rates ? parseJson<Record<string, string> | null>(kit.rates, null) : null,
    contact_email: kit.contact_email,
  };
}

mediakit.get("/", async (c) => {
  const kit = await readKit(c.env);
  const { results: clips } = await c.env.DB.prepare(
    "SELECT id, hook_text, score, media_token, cover_r2_key FROM clips WHERE status = 'approved' AND media_token IS NOT NULL ORDER BY score DESC, created_at DESC LIMIT 40",
  ).all<{ id: string; hook_text: string; score: number; media_token: string; cover_r2_key: string | null }>();
  const profile = await lockedProfile(c.env);
  return c.json({
    kit: {
      bio: kit.bio,
      has_photo: !!kit.photo_r2_key,
      featured_clip_ids: parseJson<string[]>(kit.featured_clip_ids, []),
      past_partners: parseJson<string[]>(kit.past_partners, []),
      rates: kit.rates ? parseJson<Record<string, string> | null>(kit.rates, null) : null,
      public_slug: kit.public_slug,
      contact_email: kit.contact_email,
      updated_at: kit.updated_at,
    },
    preview: await publicMediaKit(c.env, kit.public_slug),
    public_url: `${c.env.PUBLIC_BASE_URL}/kit/${kit.public_slug}`,
    print_url: `/api/public/kit/${kit.public_slug}/print`,
    profile_locked: !!profile,
    clips: clips.map((x) => ({ id: x.id, hook_text: x.hook_text, score: x.score, media_url: `/media/${x.media_token}`, cover_url: x.cover_r2_key ? `/media/${x.media_token}?cover=1` : null })),
  });
});

interface KitPatch {
  bio?: string;
  featured_clip_ids?: string[];
  past_partners?: string[];
  rates?: Record<string, string> | null;
  contact_email?: string | null;
  public_slug?: string;
}

mediakit.patch("/", async (c) => {
  const body = await readJson<KitPatch>(c);
  if (!body) return fail(c, 400, "Nothing to save.");
  const kit = await readKit(c.env);
  const next = { ...kit };

  if (body.bio !== undefined) {
    const bio = String(body.bio).trim();
    if (bio.length > 300) return fail(c, 422, "Keep the bio to one or two lines (300 characters).", "update-your-media-kit");
    next.bio = bio;
  }
  if (body.featured_clip_ids !== undefined) {
    if (!Array.isArray(body.featured_clip_ids) || body.featured_clip_ids.length > MAX_FEATURED) return fail(c, 422, `Pick up to ${MAX_FEATURED} clips.`, "update-your-media-kit");
    const ids = [...new Set(body.featured_clip_ids.map(String))];
    for (const id of ids) {
      const ok = await c.env.DB.prepare("SELECT id FROM clips WHERE id = ? AND status = 'approved' AND media_token IS NOT NULL").bind(id).first();
      if (!ok) return fail(c, 422, "Only approved clips can go in your media kit.", "update-your-media-kit");
    }
    next.featured_clip_ids = JSON.stringify(ids);
  }
  if (body.past_partners !== undefined) {
    if (!Array.isArray(body.past_partners)) return fail(c, 400, "Past partners must be a list.");
    const partners = body.past_partners.map((s) => String(s).trim()).filter(Boolean);
    if (partners.length > 12 || partners.some((p) => p.length > 60)) return fail(c, 422, "List up to 12 past partners, short names only.", "update-your-media-kit");
    next.past_partners = JSON.stringify(partners);
  }
  if (body.rates !== undefined) {
    if (body.rates === null) next.rates = null;
    else {
      const entries = Object.entries(body.rates)
        .map(([k, v]) => [String(k).trim(), String(v).trim()] as const)
        .filter(([k, v]) => k && v);
      if (entries.length > 6 || entries.some(([k, v]) => k.length > 40 || v.length > 40)) return fail(c, 422, "Up to 6 rates, short labels and prices.", "update-your-media-kit");
      next.rates = entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
    }
  }
  if (body.contact_email !== undefined) {
    const e = body.contact_email ? String(body.contact_email).trim().toLowerCase() : null;
    if (e && !isEmail(e)) return fail(c, 422, "That contact email does not look right.", "update-your-media-kit");
    next.contact_email = e;
  }
  if (body.public_slug !== undefined) {
    const slug = String(body.public_slug).trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) return fail(c, 422, "The link name can use 3–40 lower-case letters, numbers and dashes.", "update-your-media-kit");
    next.public_slug = slug;
  }

  await c.env.DB.prepare(
    "UPDATE media_kit SET bio = ?, featured_clip_ids = ?, past_partners = ?, rates = ?, contact_email = ?, public_slug = ?, updated_at = ? WHERE id = 1",
  )
    .bind(next.bio, next.featured_clip_ids, next.past_partners, next.rates, next.contact_email, next.public_slug, nowIso())
    .run();
  await recordEvent(c.env.DB, "mediakit.saved", null, { fields: Object.keys(body) }, c.get("user").email);
  log.info("mediakit.saved", { fields: Object.keys(body).length });
  return c.json({ ok: true, public_slug: next.public_slug });
});

/** The photo was uploaded through /api/uploads with kind "kit_photo"; record its key here. */
mediakit.post("/photo/:uploadId", async (c) => {
  const uploadId = c.req.param("uploadId");
  if (!/^upl_[a-z0-9]{6,40}$/.test(uploadId)) return fail(c, 400, "That upload is not a photo.");
  const key = `kit/photo/${uploadId}`;
  const head = await c.env.FILES.head(key);
  if (!head) return fail(c, 404, "The photo did not finish uploading. Try again.", "update-your-media-kit");
  if (!(head.httpMetadata?.contentType ?? "").startsWith("image/")) return fail(c, 422, "Pick a photo (JPG or PNG).", "update-your-media-kit");
  if (head.size > 8 * 1024 * 1024) {
    await c.env.FILES.delete(key);
    return fail(c, 413, "That photo is too big. Pick one under 8 MB.", "update-your-media-kit");
  }
  const kit = await readKit(c.env);
  if (kit.photo_r2_key && kit.photo_r2_key !== key) await c.env.FILES.delete(kit.photo_r2_key);
  await c.env.DB.prepare("UPDATE media_kit SET photo_r2_key = ?, updated_at = ? WHERE id = 1").bind(key, nowIso()).run();
  await recordEvent(c.env.DB, "mediakit.photo", null, {}, c.get("user").email);
  return c.json({ ok: true });
});

mediakit.delete("/photo", async (c) => {
  const kit = await readKit(c.env);
  if (kit.photo_r2_key) await c.env.FILES.delete(kit.photo_r2_key);
  await c.env.DB.prepare("UPDATE media_kit SET photo_r2_key = NULL, updated_at = ? WHERE id = 1").bind(nowIso()).run();
  return c.json({ ok: true });
});

mediakit.get("/pdf", async (c) => {
  const kit = await readKit(c.env);
  return c.redirect(`/api/public/kit/${encodeURIComponent(kit.public_slug)}/print?autoprint=1`, 302);
});
