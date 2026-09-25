// OpenRouter, free models by default (section 1 decision 6). Used by the Worker for
// small, quick calls (pitch drafts, brief edits); the heavy runs happen in jobs/.
import type { Env } from "../env";
import { fakeServices } from "../env";
import { getConnectionSecret } from "../lib/connections";

export const FREE_MODEL = "openrouter/free";

export interface LlmClient {
  complete(input: { system: string; user: string; json?: boolean; maxTokens?: number }): Promise<{ ok: boolean; text: string; error: string | null }>;
  checkKey(): Promise<{ ok: boolean; error: string | null }>;
}

class FakeLlm implements LlmClient {
  async complete(input: { system: string; user: string; json?: boolean }) {
    if (input.json) return { ok: true, text: JSON.stringify({ fake: true, echo: input.user.slice(0, 40) }), error: null };
    return { ok: true, text: `(fake model) ${input.user.slice(0, 80)}`, error: null };
  }
  async checkKey() {
    return { ok: true, error: null };
  }
}

class RealLlm implements LlmClient {
  constructor(private key: string, private referer: string) {}
  async complete(input: { system: string; user: string; json?: boolean; maxTokens?: number }) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "HTTP-Referer": this.referer, "X-Title": "Sheila Studio" },
        body: JSON.stringify({
          model: FREE_MODEL,
          max_tokens: input.maxTokens ?? 1200,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          ...(input.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (res.status === 429) return { ok: false, text: "", error: "The free AI model is busy right now. Try again in a minute." };
      if (!res.ok) return { ok: false, text: "", error: `AI service answered ${res.status}` };
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { ok: true, text: data.choices?.[0]?.message?.content ?? "", error: null };
    } catch (e) {
      return { ok: false, text: "", error: e instanceof Error ? e.message : "AI service did not answer." };
    }
  }
  async checkKey() {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${this.key}` } });
    if (res.status === 401) return { ok: false, error: "OpenRouter says this key is not valid." };
    if (!res.ok) return { ok: false, error: `OpenRouter answered ${res.status}` };
    return { ok: true, error: null };
  }
}

export async function getLlm(env: Env, keyOverride?: string): Promise<LlmClient> {
  const key = keyOverride ?? (await getConnectionSecret(env, "openrouter"));
  if (fakeServices(env) || !key) return new FakeLlm();
  return new RealLlm(key, env.PUBLIC_BASE_URL);
}
