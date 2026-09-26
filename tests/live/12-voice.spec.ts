// Checklist 12: Voice, built-in engine end to end on staging (ElevenLabs stays connected there,
// but her plan has no cloning, so narrations use the built-in voice). A 64 s consent sample made
// with macOS `say` (a synthetic voice, not a person) → Save my voice → Generate from real text →
// the `voice` job (Chatterbox on the Actions CPU) → the narration plays from its media URL →
// Attach to clip → Delete my voice removes the sample and model.
import { expect, test } from "@playwright/test";
import { d1, evidence, latestRun, shot, waitForRow } from "./helpers";

const SAMPLE = process.env.LIVE_VOICE_SAMPLE ?? "";
const SCRIPT = "TEST narration for Sheila Studio. Layer it up, mix your candle heights, and never forget the place cards. Save this for your next dinner party.";

test.describe.configure({ mode: "serial" });

test("12a · consent sample → voice job on Actions → narration plays → attach to a clip", async ({ page }) => {
  test.setTimeout(100 * 60_000);
  page.setDefaultTimeout(60_000); // one stuck click must not sit out the 100-minute job budget
  expect(SAMPLE, "set LIVE_VOICE_SAMPLE to a 60 s+ wav").not.toBe("");
  // Voice overs are always visible since #22 (no Settings switch any more).
  await page.goto("/voice");
  await expect(page.getByRole("button", { name: "Delete my voice" }).or(page.getByRole("heading", { name: "Set up your voice in 5 steps" }))).toBeVisible(); // loaded
  if (await page.getByRole("button", { name: "Delete my voice" }).isVisible()) {
    await page.getByRole("button", { name: "Delete my voice" }).click();
    await page.getByRole("button", { name: "Yes, delete my voice" }).click();
    await expect(page.getByRole("heading", { name: "Set up your voice in 5 steps" })).toBeVisible();
  }
  await page.getByLabel("Upload a voice clip").setInputFiles(SAMPLE);
  await expect(page.getByTestId("sample-length")).toContainText("1:04");
  await page.getByLabel(/This is my own voice and I consent/).check();
  await page.getByRole("button", { name: "Save my voice" }).click();
  await expect(page.getByText(/Voice ready · saved/)).toBeVisible({ timeout: 60_000 });
  const [voiceRow] = d1<{ sample_r2_key: string | null; consent_at: string | null }>("SELECT sample_r2_key, consent_at FROM voice WHERE id = 1");
  expect(voiceRow?.sample_r2_key && voiceRow.consent_at).toBeTruthy();

  const since = Date.now();
  await page.getByRole("textbox", { name: /^Script/ }).fill(SCRIPT);
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.locator(".toast").last()).toContainText(/Generating|narration/i);
  const newest = page.locator("[data-narration]").first();
  const narrationId = (await newest.getAttribute("data-narration"))!;
  // The workflow's 90-minute timeout is the fault detector (no earlier run to take 1.5x of).
  const [row] = await waitForRow<{ status: string; engine: string; audio_r2_key: string | null; duration_s: number | null }>(
    `SELECT status, engine, r2_key AS audio_r2_key, duration_s FROM narrations WHERE id = '${narrationId}'`,
    (r) => ["ready", "failed"].includes(r[0]?.status ?? ""),
    92 * 60_000,
    30_000,
  );
  const run = latestRun("job-voice.yml", since);
  const [job] = d1<{ id: string; status: string; safe_error: string | null; run_id: string | null; created_at: string; finished_at: string | null }>("SELECT id, status, safe_error, run_id, created_at, finished_at FROM jobs WHERE type = 'voice' ORDER BY created_at DESC LIMIT 1");
  expect(row!.status, job?.safe_error ?? "").toBe("ready");
  expect(row!.engine).toBe("built-in");

  await page.reload();
  const player = page.locator(`[data-narration="${narrationId}"]`).getByLabel(/^Play (narration|voice over)$/);
  await expect(player).toBeVisible();
  const src = (await player.getAttribute("src"))!;
  const audio = await page.request.get(src);
  expect(audio.status()).toBe(200);
  expect(audio.headers()["content-type"]).toMatch(/^audio\//);
  const seconds = await player.evaluate(async (a: HTMLAudioElement) => {
    a.preload = "auto";
    a.load();
    await new Promise((r) => a.addEventListener("loadedmetadata", r, { once: true }));
    return a.duration;
  });
  expect(seconds).toBeGreaterThan(3);
  const narrShot = await shot(page, "12-voice-narration");

  // Attach it to an approved clip.
  await page.locator(`[data-narration="${narrationId}"]`).getByRole("button", { name: "Attach to clip" }).click();
  const dialog = page.getByRole("dialog", { name: "Attach to a clip" });
  await dialog.locator(".attach-row").first().click();
  await expect(page.locator(".toast").filter({ hasText: "Attached" }).first()).toBeVisible();
  const [attached] = d1<{ clip_id: string | null }>(`SELECT clip_id FROM narrations WHERE id = '${narrationId}'`);
  expect(attached?.clip_id).toBeTruthy();
  evidence("12-voice", { narration: narrationId, engine: row!.engine, duration_s: row!.duration_s, audio_status: audio.status(), audio_type: audio.headers()["content-type"], media_url_path: new URL(src, "https://x").pathname.replace(/[^/]{20,}$/, "<token>"), played_seconds: Math.round(seconds * 10) / 10, voice_job: job?.id, run_id: run?.databaseId ?? job?.run_id, job_minutes: job?.finished_at ? Math.round((Date.parse(job.finished_at) - Date.parse(job.created_at)) / 6000) / 10 : null, attached_clip: attached!.clip_id, screenshot: narrShot });
});

test("12b · Delete my voice removes the sample and the model", async ({ page }) => {
  await page.goto("/voice");
  await page.getByRole("button", { name: "Delete my voice" }).click();
  await page.getByRole("button", { name: "Yes, delete my voice" }).click();
  await expect(page.getByRole("heading", { name: "Set up your voice in 5 steps" })).toBeVisible();
  const [v] = d1<{ sample_r2_key: string | null; model_r2_key: string | null; consent_at: string | null }>("SELECT sample_r2_key, model_r2_key, consent_at FROM voice WHERE id = 1");
  expect(v).toEqual({ sample_r2_key: null, model_r2_key: null, consent_at: null });
  evidence("12-voice", { deleted: true, deleted_screenshot: await shot(page, "12-voice-deleted") });
});
