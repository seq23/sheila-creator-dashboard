import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, SessionUser, Vars } from "../env";
import { signSession, verifySessionCookie } from "./crypto";
import { getSetting } from "./db";
import { newId, nowIso, addDays } from "./ids";

export const SESSION_COOKIE = "ss_session";
const SESSION_DAYS = 30;

type C = Context<{ Bindings: Env; Variables: Vars }>;

/** Who may log in: the owner (wrangler var) plus the optional helper set in Settings. */
export async function allowedRole(env: Env, email: string): Promise<"owner" | "helper" | null> {
  const e = email.trim().toLowerCase();
  if (e === env.OWNER_EMAIL.trim().toLowerCase()) return "owner";
  const helper = await getSetting<string | null>(env.DB, "helper_email", null);
  if (helper && e === helper.trim().toLowerCase()) return "helper";
  return null;
}

export async function ensureUser(env: Env, email: string, role: "owner" | "helper"): Promise<SessionUser> {
  const e = email.trim().toLowerCase();
  const existing = await env.DB.prepare("SELECT id, email, role FROM users WHERE email = ?").bind(e).first<SessionUser>();
  if (existing) {
    if (existing.role !== role) await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, existing.id).run();
    return { ...existing, role };
  }
  const id = newId("usr");
  await env.DB.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, ?)").bind(id, e, role).run();
  return { id, email: e, role };
}

export async function createSession(c: C, user: SessionUser): Promise<void> {
  const id = newId("ses", 24);
  const expires = addDays(nowIso(), SESSION_DAYS);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(id, user.id, expires, nowIso()).run();
  await c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(nowIso(), user.id).run();
  const value = await signSession(c.env.SESSION_SECRET, id);
  const secure = c.env.PUBLIC_BASE_URL.startsWith("https://");
  setCookie(c, SESSION_COOKIE, value, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession(c: C): Promise<void> {
  const cookie = getCookie(c, SESSION_COOKIE);
  const id = await verifySessionCookie(c.env.SESSION_SECRET, cookie);
  if (id) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function userFromRequest(c: C): Promise<SessionUser | null> {
  const cookie = getCookie(c, SESSION_COOKIE);
  const id = await verifySessionCookie(c.env.SESSION_SECRET, cookie);
  if (!id) return null;
  const row = await c.env.DB.prepare(
    "SELECT u.id, u.email, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
  )
    .bind(id)
    .first<SessionUser & { expires_at: string }>();
  if (!row) return null;
  if (row.expires_at < nowIso()) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  return { id: row.id, email: row.email, role: row.role };
}

/** Middleware: every /api route except the public ones. */
export async function requireUser(c: C, next: Next) {
  const user = await userFromRequest(c);
  if (!user) return c.json({ error: "Please log in.", fix_guide: "log-in" }, 401);
  c.set("user", user);
  await next();
}

export async function requireOwner(c: C, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "owner") return c.json({ error: "Only the owner can do this." }, 403);
  await next();
}
