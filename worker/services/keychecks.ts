// "Check key" for the paste-a-key services on the Connect screen: Firecrawl, Hunter,
// Resend, OpenRouter, Buffer, ElevenLabs. Each returns ok + a plain sentence + meta for the card.
import type { Env } from "../env";
import { fakeServices } from "../env";
import { getBuffer } from "./buffer";
import { getLlm } from "./openrouter";
import { getElevenLabs } from "./elevenlabs";
import { planMeta } from "../lib/premiumVoice";

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

/**
 * ElevenLabs (premium voice): reads her plan. A key on a plan without cloning is accepted and
 * says so plainly; the built-in voice is used. `note` is the sentence the card and toast show.
 */
export async function checkElevenLabs(env: Env, key: string): Promise<KeyCheck & { note?: string }> {
  const client = await getElevenLabs(env, key);
  const r = await client!.subscription();
  if (!r.ok) {
    if (r.failure === "auth") return { ok: false, error: "ElevenLabs says this key is not valid.", meta: {} };
    return { ok: false, error: "ElevenLabs did not answer. Try Check key again in a minute.", meta: {} };
  }
  const note = r.plan.canClone ? "ElevenLabs connected. Your narrations will use the premium voice." : "Your ElevenLabs plan does not include voice cloning; the built-in voice will be used.";
  return { ok: true, error: null, meta: planMeta(r.plan), note };
}
