// "Check key" for the paste-a-key services on the Connect screen: Firecrawl, Hunter,
// Resend, OpenRouter, Buffer. Each returns ok + a plain sentence + meta for the card.
import type { Env } from "../env";
import { fakeServices } from "../env";
import { getBuffer } from "./buffer";
import { getLlm } from "./openrouter";

export interface KeyCheck {
  ok: boolean;
  error: string | null;
  meta: Record<string, unknown>;
}

export async function checkFirecrawl(env: Env, key: string): Promise<KeyCheck> {
  if (fakeServices(env)) return key.startsWith("bad") ? { ok: false, error: "Firecrawl says this key is not valid.", meta: {} } : { ok: true, error: null, meta: { credits_left: 980 } };
  const res = await fetch("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { Authorization: `Bearer ${key}` } });
  if (res.status === 401) return { ok: false, error: "Firecrawl says this key is not valid.", meta: {} };
  if (!res.ok) return { ok: false, error: `Firecrawl answered ${res.status}`, meta: {} };
  const data = (await res.json()) as { data?: { remaining_credits?: number } };
  return { ok: true, error: null, meta: { credits_left: data.data?.remaining_credits ?? null } };
}

export async function checkHunter(env: Env, key: string): Promise<KeyCheck> {
  if (fakeServices(env)) return key.startsWith("bad") ? { ok: false, error: "Hunter says this key is not valid.", meta: {} } : { ok: true, error: null, meta: { credits_left: 38, credits_total: 50 } };
  const res = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`);
  if (res.status === 401) return { ok: false, error: "Hunter says this key is not valid.", meta: {} };
  if (!res.ok) return { ok: false, error: `Hunter answered ${res.status}`, meta: {} };
  const data = (await res.json()) as { data?: { requests?: { searches?: { used?: number; available?: number } } } };
  const used = data.data?.requests?.searches?.used ?? 0;
  const total = data.data?.requests?.searches?.available ?? 50;
  return { ok: true, error: null, meta: { credits_left: Math.max(0, total - used), credits_total: total } };
}

export async function checkOpenRouter(env: Env, key: string): Promise<KeyCheck> {
  const llm = await getLlm(env, key);
  const r = await llm.checkKey();
  return { ok: r.ok, error: r.error, meta: { model: "free" } };
}

export async function checkBufferKey(env: Env, key: string): Promise<KeyCheck> {
  const buffer = await getBuffer(env, key);
  const r = await buffer.checkKey();
  return { ok: r.ok, error: r.error, meta: { channels: r.channels } };
}
