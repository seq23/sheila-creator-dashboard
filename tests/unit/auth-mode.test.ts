// AUTH_MODE: "open" (production, the owner's choice) lets every request in as the owner with no
// login and 404s the login API; "code" (staging, dev, e2e) keeps the email-code login exactly as
// it was. The session middleware, /api/me and /api/auth run against the real schema (sqlite-d1).
import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { Env, Vars } from "@worker/env";
import { authMode } from "@worker/env";
import { requireOwner, requireUser } from "@worker/lib/auth";
import { auth } from "@worker/routes/auth";
import { me } from "@worker/routes/me";
import { home } from "@worker/routes/home";
import type { Me } from "@shared/types";
import { sqliteD1 } from "./helpers/sqlite-d1";
// @ts-expect-error plain .mjs validator, no types
import { compareEnvs, loginLinks, parseJsonc, REQUIRED_AUTH_MODE } from "../../scripts/validators/envs-match.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const OWNER = "asheilabruceaffair@gmail.com";
const BASE = "http://w.example";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();
app.get("/api/who", requireUser, (c) => c.json(c.get("user")));
app.post("/api/owner-only", requireUser, requireOwner, (c) => c.json({ ok: true }));
app.route("/api/auth", auth);
app.route("/api/me", me);
app.route("/api/home", home);

let db: ReturnType<typeof sqliteD1>;
const envFor = (mode: string | undefined): Env =>
  ({ DB: db.DB, OWNER_EMAIL: OWNER, SESSION_SECRET: "session-secret-for-tests", APP_NAME: "Sheila Studio", FAKE_SERVICES: "1", PUBLIC_BASE_URL: BASE, AUTH_MODE: mode }) as unknown as Env;
const users = () => db.raw.prepare("SELECT id, email, role FROM users").all() as { id: string; email: string; role: string }[];

beforeEach(() => {
  db = sqliteD1();
});

describe("authMode()", () => {
  it("only the exact word \"open\" turns the login off; missing or mistyped keeps it on", () => {
    expect(authMode({ AUTH_MODE: "open" })).toBe("open");
    for (const AUTH_MODE of ["code", undefined, "", "Open", "open ", "opened", "none"]) expect(authMode({ AUTH_MODE })).toBe("code");
  });
});

describe("open mode (production)", () => {
  const env = () => envFor("open");

  it("an unauthenticated request is the owner: OWNER_EMAIL, role owner, no cookie needed or set", async () => {
    const res = await app.request(`${BASE}/api/who`, {}, env());
    expect(res.status).toBe(200);
    const user = (await res.json()) as { id: string; email: string; role: string };
    expect(user).toMatchObject({ email: OWNER, role: "owner" });
    expect(user.id).toMatch(/^usr_/);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("creates the owner once on the first hit and reuses it after (no duplicate users)", async () => {
    expect(users()).toEqual([]);
    const a = (await (await app.request(`${BASE}/api/who`, {}, env())).json()) as { id: string };
    const b = (await (await app.request(`${BASE}/api/who`, {}, env())).json()) as { id: string };
    expect(b.id).toBe(a.id);
    expect(users()).toEqual([{ id: a.id, email: OWNER, role: "owner" }]);
  });

  it("owner-only actions pass (the visitor is the owner)", async () => {
    const res = await app.request(`${BASE}/api/owner-only`, { method: "POST" }, env());
    expect(res.status).toBe(200);
  });

  it("GET /api/me says who and that the mode is open", async () => {
    const res = await app.request(`${BASE}/api/me`, {}, env());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Me;
    expect(body).toMatchObject({ email: OWNER, role: "owner", appName: "Sheila Studio", authMode: "open" });
    expect(body.features).toEqual({ voice: true, deeper_research: true, weekly_recap: true, help_ask: true }); // nothing switched off (migration 0010)
  });

  it("every /api/auth route is a 404 (no code is made, no email is sent)", async () => {
    const post = (p: string, body: unknown) => app.request(`${BASE}/api/auth/${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env());
    expect((await post("request", { email: OWNER })).status).toBe(404);
    expect((await post("verify", { email: OWNER, code: "123456" })).status).toBe(404);
    expect((await post("logout", {})).status).toBe(404);
    expect((await app.request(`${BASE}/api/auth/me`, {}, env())).status).toBe(404);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM login_codes").get()).toEqual({ n: 0 });
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM emails_sent").get()).toEqual({ n: 0 });
  });

  it("a real screen's API (Home) answers with no cookie", async () => {
    const res = await app.request(`${BASE}/api/home`, {}, env());
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()) as object)).toEqual(expect.arrayContaining(["runway", "waiting", "health"]));
  });
});

describe("code mode (staging, dev, e2e): unchanged", () => {
  for (const mode of ["code", undefined]) {
    it(`AUTH_MODE ${JSON.stringify(mode)}: an unauthenticated request is a 401 with the log-in guide, and no user is made`, async () => {
      const env = envFor(mode);
      const res = await app.request(`${BASE}/api/who`, {}, env);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Please log in.", fix_guide: "log-in" });
      expect((await app.request(`${BASE}/api/me`, {}, env)).status).toBe(401);
      expect((await app.request(`${BASE}/api/home`, {}, env)).status).toBe(401);
      expect((await app.request(`${BASE}/api/owner-only`, { method: "POST" }, env)).status).toBe(401);
      expect(users()).toEqual([]);
    });
  }

  it("a forged cookie is still refused", async () => {
    const res = await app.request(`${BASE}/api/who`, { headers: { cookie: "ss_session=ses_forged.deadbeef" } }, envFor("code"));
    expect(res.status).toBe(401);
  });

  it("the email-code login still works end to end, and /api/me then says code mode", async () => {
    const env = envFor("code");
    const json = { "content-type": "application/json" };
    const r = await app.request(`${BASE}/api/auth/request`, { method: "POST", headers: json, body: JSON.stringify({ email: OWNER }) }, env);
    expect(r.status).toBe(200);
    const { dev_code } = (await r.json()) as { dev_code?: string };
    expect(dev_code).toMatch(/^\d{6}$/);
    const v = await app.request(`${BASE}/api/auth/verify`, { method: "POST", headers: json, body: JSON.stringify({ email: OWNER, code: dev_code }) }, env);
    expect(v.status).toBe(200);
    const cookie = v.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toMatch(/^ss_session=/);
    const m = await app.request(`${BASE}/api/me`, { headers: { cookie } }, env);
    expect(m.status).toBe(200);
    expect(await m.json()).toMatchObject({ email: OWNER, role: "owner", authMode: "code" });
    const legacy = await app.request(`${BASE}/api/auth/me`, { headers: { cookie } }, env);
    expect(await legacy.json()).toMatchObject({ email: OWNER, authMode: "code" });
  });
});

describe("envs-match pins the modes", () => {
  const root = path.resolve(__dirname, "../..");
  const cfg = () => parseJsonc(readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));

  it("the committed config is production open, staging code", () => {
    const c = cfg();
    expect(REQUIRED_AUTH_MODE).toEqual({ production: "open", staging: "code" });
    expect(c.vars.AUTH_MODE).toBe("open");
    expect(c.env.staging.vars.AUTH_MODE).toBe("code");
    expect(c.name).toBe("sheilastudio");
    expect(c.env.staging.name).toBe("sheila-creator-dashboard-staging");
  });

  it("fails when production keeps the login or staging loses it", () => {
    const c = cfg();
    c.vars.AUTH_MODE = "code";
    c.env.staging.vars.AUTH_MODE = "open";
    expect(compareEnvs(c).problems).toEqual(
      expect.arrayContaining(['top-level vars.AUTH_MODE must be "open" (is "code")', 'env.staging vars.AUTH_MODE must be "code" (is "open")']),
    );
    const d = cfg();
    delete d.vars.AUTH_MODE;
    delete d.env.staging.vars.AUTH_MODE;
    expect(compareEnvs(d).problems).toEqual(expect.arrayContaining(["top-level vars.AUTH_MODE must be \"open\" (is undefined)", "env.staging vars.AUTH_MODE must be \"code\" (is undefined)"]));
  });

  it("finds every kind of link to /login and ignores look-alikes", () => {
    const bad = [
      ["app/a.tsx", '<Link to="/login">Log in</Link>'],
      ["app/b.tsx", "<a href='/login?next=/'>x</a>"],
      ["app/c.tsx", 'navigate("/login")'],
      ["app/d.tsx", "<Navigate to={`/login`} replace />"],
      ["app/e.ts", 'window.location.href = "/login";'],
    ];
    expect(loginLinks(bad)).toHaveLength(5);
    const fine = [["app/f.tsx", '<Route path="*" element={<Login />} />\nconst s = "login-card"; to="/logins-report"; post("/api/auth/request")']];
    expect(loginLinks(fine)).toEqual([]);
  });
});
