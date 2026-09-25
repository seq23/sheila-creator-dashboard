// Connect accounts (section 4b). Paste-a-key services are checked live and stored
// encrypted. Meta/Google OAuth for stats is Phase 3 and registers its start/callback here.
import { Hono } from "hono";
import type { Env, Vars } from "../env";
import { requireOwner, requireUser } from "../lib/auth";
import { disconnect, listConnections, saveConnection, type Service } from "../lib/connections";
import { recordEvent, setHealth } from "../lib/db";
import { fail, readJson } from "../lib/http";
import { log } from "../lib/log";
import { checkBufferKey, checkFirecrawl, checkHunter, checkOpenRouter } from "../services/keychecks";
import type { KeyCheck } from "../services/keychecks";

export const connections = new Hono<{ Bindings: Env; Variables: Vars }>();
connections.use("*", requireUser);

connections.get("/", async (c) => c.json(await listConnections(c.env)));

const CHECKS: Partial<Record<Service, (env: Env, key: string) => Promise<KeyCheck>>> = {
  buffer: checkBufferKey,
  openrouter: checkOpenRouter,
  firecrawl: checkFirecrawl,
  hunter: checkHunter,
};

/** Paste a key → live check → stored encrypted only if it works. */
connections.post("/:service/key", requireOwner, async (c) => {
  const service = c.req.param("service") as Service;
  const check = CHECKS[service];
  if (!check) return fail(c, 404, "That service does not take a pasted key.");
  const body = await readJson<{ key?: string }>(c);
  const key = body?.key?.trim();
  if (!key || key.length < 8 || key.length > 512) return fail(c, 400, "Paste the whole key.");
  const r = await check(c.env, key);
  if (!r.ok) {
    await saveConnection(c.env, service, null, "error", r.meta, r.error);
    return fail(c, 422, r.error ?? "That key did not work.", `connect-${service}`);
  }
  await saveConnection(c.env, service, key, "ok", r.meta);
  await setHealth(c.env.DB, service, "green", "Connected", null);
  if (service === "buffer") await syncBufferChannelHealth(c.env, r.meta);
  await recordEvent(c.env.DB, "connection.ok", service, {}, c.get("user").email);
  log.info("connection.ok", { service });
  return c.json({ ok: true, meta: r.meta });
});

/** Re-run the check with the stored key (the "Check again" button). */
connections.post("/:service/recheck", async (c) => {
  const service = c.req.param("service") as Service;
  const check = CHECKS[service];
  if (!check) return fail(c, 404, "That service cannot be rechecked here.");
  const { getConnectionSecret, markConnection } = await import("../lib/connections");
  const key = await getConnectionSecret(c.env, service);
  if (!key) return fail(c, 409, "Not connected yet.", `connect-${service}`);
  const r = await check(c.env, key);
  await markConnection(c.env, service, r.ok ? "ok" : "error", r.error, r.meta);
  await setHealth(c.env.DB, service, r.ok ? "green" : "red", r.ok ? "Connected" : (r.error ?? "Needs you"), r.ok ? null : `reconnect-${service}`);
  if (service === "buffer" && r.ok) await syncBufferChannelHealth(c.env, r.meta);
  return r.ok ? c.json({ ok: true, meta: r.meta }) : fail(c, 422, r.error ?? "Check failed.", `reconnect-${service}`);
});

connections.post("/:service/disconnect", requireOwner, async (c) => {
  const service = c.req.param("service") as Service;
  await disconnect(c.env, service);
  await setHealth(c.env.DB, service, "grey", "Disconnected", `connect-${service}`);
  await recordEvent(c.env.DB, "connection.disconnected", service, {}, c.get("user").email);
  return c.json({ ok: true });
});

connections.post("/disconnect-all", requireOwner, async (c) => {
  const all: Service[] = ["buffer", "openrouter", "firecrawl", "resend", "hunter", "meta", "google", "tiktok", "github"];
  for (const s of all) {
    await disconnect(c.env, s);
    await setHealth(c.env.DB, s, "grey", "Disconnected", `connect-${s}`);
  }
  await recordEvent(c.env.DB, "connection.disconnected_all", null, {}, c.get("user").email);
  return c.json({ ok: true });
});

/** Buffer channels become their own health lights: "TikTok (via Buffer)" etc. */
export async function syncBufferChannelHealth(env: Env, meta: Record<string, unknown>) {
  const channels = (meta.channels as { platform: string; handle: string; connected: boolean }[] | undefined) ?? [];
  const names: Record<string, string> = { tiktok: "TikTok (via Buffer)", instagram: "Instagram (via Buffer)", youtube: "YouTube (via Buffer)" };
  for (const p of ["tiktok", "instagram", "youtube"]) {
    const ch = channels.find((x) => x.platform === p);
    if (!ch) await setHealth(env.DB, names[p], "red", "Not added in Buffer yet", "add-channels-in-buffer");
    else if (!ch.connected) await setHealth(env.DB, names[p], "red", "Needs reconnect in Buffer", "reconnect-an-account");
    else await setHealth(env.DB, names[p], "green", `${ch.handle} · posting OK`, null);
  }
}
