// Chatterbox narration (section 12): the "built-in" engine (free). The premium engine
// (ElevenLabs) never reaches this job; it runs in the Worker (worker/lib/premiumVoice.ts). The job (jobs/voice.py) clones her voice from the consented
// sample on the Actions CPU runner, writes the narration to R2 and calls back. Every generated
// file is logged in `events`. The fake writes a short tone WAV so the screen can be exercised.
import type { JobHandler } from "./registry";
import type { Env } from "../env";
import { log } from "../lib/log";
import { recordEvent, setHealth } from "../lib/db";
import { nowIso } from "../lib/ids";

export const VOICE_MODEL_KEY = "voice/model/conds.pt";

interface NarrationDb {
  id: string;
  script: string;
  status: string;
}

async function narration(env: Env, id: string | null): Promise<NarrationDb | null> {
  if (!id) return null;
  return env.DB.prepare("SELECT id, script, status FROM narrations WHERE id = ?").bind(id).first<NarrationDb>();
}

/** 16-bit mono PCM WAV: a short silence, a soft tone, a short silence. */
export function toneWav(seconds = 2, sampleRate = 16_000, hz = 440): Uint8Array {
  const n = Math.floor(seconds * sampleRate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  const quiet = Math.floor(n / 4);
  for (let i = 0; i < n; i++) {
    const on = i >= quiet && i < n - quiet;
    const s = on ? Math.sin((2 * Math.PI * hz * i) / sampleRate) * 0.2 : 0;
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

export const voiceJob: JobHandler = {
  async buildSpec(env, jobId, refId) {
    const n = await narration(env, refId);
    const v = await env.DB.prepare("SELECT sample_r2_key, consent_at, model_r2_key FROM voice WHERE id = 1").first<{ sample_r2_key: string | null; consent_at: string | null; model_r2_key: string | null }>();
    if (!n || !v?.sample_r2_key || !v.consent_at) throw new Error("no consented voice sample or narration");
    await env.DB.prepare("UPDATE narrations SET status = 'generating' WHERE id = ?").bind(n.id).run();
    return {
      job_id: jobId,
      ref_id: refId,
      type: "voice",
      narration_id: n.id,
      script: n.script,
      sample_key: v.sample_r2_key,
      model_key: v.model_r2_key ?? VOICE_MODEL_KEY,
      model_exists: !!v.model_r2_key,
      output_key: `voice/narrations/${n.id}.mp3`,
    };
  },

  async applyResult(env, jobId, refId, result) {
    const r = (result ?? {}) as { r2_key?: string; duration_s?: number; bytes?: number; model_key?: string };
    if (!refId || !r.r2_key || !r.r2_key.startsWith(`voice/narrations/${refId}`)) throw new Error("voice result missing its file");
    const head = await env.FILES.head(r.r2_key);
    if (!head) throw new Error("voice file not in storage");
    const seconds = Number(r.duration_s);
    await env.DB.prepare("UPDATE narrations SET status = 'ready', r2_key = ?, duration_s = ? WHERE id = ?").bind(r.r2_key, Number.isFinite(seconds) && seconds > 0 ? seconds : null, refId).run();
    if (r.model_key && r.model_key.startsWith("voice/model/")) await env.DB.prepare("UPDATE voice SET model_r2_key = ?, updated_at = ? WHERE id = 1").bind(r.model_key, nowIso()).run();
    await recordEvent(env.DB, "voice.narration.generated", refId, { job: jobId, bytes: head.size, seconds: Number(r.duration_s ?? 0) });
    await setHealth(env.DB, "Voice", "green", "Last narration generated", null);
    log.info("voice.apply", { bytes: head.size });
  },

  async onFailure(env, jobId, refId, safeError) {
    if (refId) await env.DB.prepare("UPDATE narrations SET status = 'failed' WHERE id = ?").bind(refId).run();
    await recordEvent(env.DB, "voice.narration.failed", refId, { job: jobId });
    await setHealth(env.DB, "Voice", "red", "A narration did not finish. Try Generate again; a shorter script is faster.", "record-your-voice");
    log.warn("voice.failed", { len: safeError.length });
  },

  async onProgress(env, _jobId, refId) {
    if (refId) await env.DB.prepare("UPDATE narrations SET status = 'generating' WHERE id = ? AND status = 'queued'").bind(refId).run();
  },

  /** FAKE_SERVICES: a 2-second tone WAV written to R2, exactly where the real job writes. */
  async fakeRun(env, _jobId, refId) {
    const key = `voice/narrations/${refId}.wav`;
    const bytes = toneWav();
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: "audio/wav" } });
    return { r2_key: key, duration_s: 2, bytes: bytes.byteLength };
  },
};
