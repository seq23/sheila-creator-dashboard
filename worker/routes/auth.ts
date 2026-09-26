// Email one-time code login (section 13: "no passwords"). Only the owner email and the
// optional helper can request a code. Codes: 6 digits, 10 minutes, 5 attempts.
// In open mode (AUTH_MODE "open", production by the owner's choice) there is no login at all:
// every /api/auth route is a 404 and lib/auth.ts treats every request as the owner.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { authMode, fakeServices } from "../env";
import { allowedRole, createSession, destroySession, ensureUser, meFor, userFromRequest } from "../lib/auth";
import { sha256Hex } from "../lib/crypto";
import { fail, isEmail, readJson } from "../lib/http";
import { newId, nowIso } from "../lib/ids";
import { log } from "../lib/log";
import { emailFrame, sendEmail } from "../services/email";

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

auth.use("*", async (c, next) => {
  if (authMode(c.env) === "open") return c.json({ error: "Not found." }, 404);
  await next();
});

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function sixDigits(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

auth.post("/request", async (c) => {
  const body = await readJson<{ email?: string }>(c);
  const email = body?.email?.trim().toLowerCase();
  if (!isEmail(email)) return fail(c, 400, "Type the email address you use for this dashboard.");
  const role = await allowedRole(c.env, email);
  // Same answer whether or not the address is allowed, so the form never reveals who can log in.
  if (!role) {
    log.warn("auth.request.denied");
    return c.json({ ok: true });
  }
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_codes WHERE email = ? AND created_at > ?")
    .bind(email, new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return fail(c, 429, "Too many codes requested. Wait 15 minutes and try again.");

  const code = sixDigits();
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await c.env.DB.prepare("INSERT INTO login_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)")
    .bind(newId("otp"), email, await sha256Hex(`${email}:${code}`), expires)
    .run();
  const { html, text } = emailFrame(`Your ${c.env.APP_NAME} code`, [`Your login code is ${code}.`, "It works for 10 minutes. If you did not ask for it, ignore this email."]);
  const sent = await sendEmail(c.env, { kind: "login_code", to: [email], subject: `${code} is your ${c.env.APP_NAME} code`, html, text });
  // Never say "check your email" when the email was refused: she would wait for nothing.
  if (!sent.ok) return fail(c, 502, "We could not send your code just now. Try again in a minute; if it keeps failing, the email service needs fixing.", "i-didnt-get-an-email");
  // Local development and tests have no mailbox: with FAKE_SERVICES the code comes back here.
  return c.json({ ok: true, ...(fakeServices(c.env) ? { dev_code: code } : {}) });
});

auth.post("/verify", async (c) => {
  const body = await readJson<{ email?: string; code?: string }>(c);
  const email = body?.email?.trim().toLowerCase();
  const code = body?.code?.replace(/\D/g, "");
  if (!isEmail(email) || !code || code.length !== 6) return fail(c, 400, "Enter the 6-digit code from your email.");
  const row = await c.env.DB.prepare("SELECT id, code_hash, expires_at, attempts, used_at FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1")
    .bind(email)
    .first<{ id: string; code_hash: string; expires_at: string; attempts: number; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at < nowIso()) return fail(c, 401, "That code has expired. Request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) return fail(c, 429, "Too many tries. Request a new code.");
  const ok = row.code_hash === (await sha256Hex(`${email}:${code}`));
  if (!ok) {
    await c.env.DB.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return fail(c, 401, "That code does not match. Check the email and try again.");
  }
  const role = await allowedRole(c.env, email);
  if (!role) return fail(c, 403, "This email is not allowed to log in.");
  await c.env.DB.prepare("UPDATE login_codes SET used_at = ? WHERE id = ?").bind(nowIso(), row.id).run();
  const user = await ensureUser(c.env, email, role);
  await createSession(c, user);
  log.info("auth.login", { role });
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await userFromRequest(c);
  if (!user) return fail(c, 401, "Please log in.", "log-in");
  return c.json(await meFor(c.env, user));
});
