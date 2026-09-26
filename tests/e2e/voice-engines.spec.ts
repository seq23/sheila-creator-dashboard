// Two voice engines, end to end in code mode on fakes (phone + desktop): connect ElevenLabs on
// Connect (plan shown), save the consented sample → the voice gains a premium clone id, narrate →
// tagged Premium and it plays; a key whose credits are used up → the narration falls back to
// Built-in with a plain toast; disconnect → Built-in; "Use premium voice when connected" off →
// Built-in even while connected. Every change is put back so other specs see the base state.
import { expect, test, type Page } from "@playwright/test";
import { sql } from "./helpers";
import { setVoice, TOUR_OFF } from "./demo";

const KEY_BOX = "Voice · ElevenLabs (premium) key";

function wav(seconds: number): Buffer {
  const rate = 8_000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 5000), 44 + i * 2);
  return b;
}

async function connect(page: Page, key: string) {
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("textbox", { name: KEY_BOX }) });
  await card.getByRole("textbox", { name: KEY_BOX }).fill(key);
  await card.getByRole("button", { name: "Check key" }).click();
}

async function disconnect(page: Page) {
  const r = await page.request.post("/api/connections/elevenlabs/disconnect");
  expect(r.ok()).toBe(true);
}

async function generate(page: Page, script: string) {
  await page.goto("/voice");
  await page.getByRole("textbox", { name: /^Script/ }).fill(script);
  await page.getByRole("button", { name: "Generate" }).click();
}

const newest = (page: Page) => page.locator(".narration").first();

test.describe("voice engines: built-in and ElevenLabs premium", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_OFF);
    await setVoice(page.request, true);
    await disconnect(page);
    sql("DELETE FROM narrations");
    sql(`UPDATE settings SET value = '"premium_when_available"' WHERE key = 'voice_engine_preference'`);
  });

  test.afterEach(async ({ page }) => {
    await page.request.patch("/api/voice/engine", { data: { preference: "premium_when_available" } });
    await page.request.delete("/api/voice/sample");
    await disconnect(page);
    sql("DELETE FROM narrations");
    await setVoice(page.request, false);
  });

  test("connect, clone, premium narration plays; used-up credits, disconnect and the switch all fall back to built-in", async ({ page }) => {
    // Voice before ElevenLabs: the built-in voice, with the way to premium
    await page.goto("/voice");
    const engine = page.locator(".engine-card");
    await expect(engine.getByText("Built-in voice (free): good quality, takes a few minutes per narration.")).toBeVisible();
    await expect(engine.getByText("ElevenLabs premium voice: best quality, seconds per narration, uses your ElevenLabs credits.")).toBeVisible();
    await expect(engine.locator(".engine-tag")).toHaveText("In use: Built-in");
    await expect(engine.getByRole("link", { name: "Connect ElevenLabs for the premium voice" })).toBeVisible();

    // Connect: a good key shows the plan and that cloning is on it
    await connect(page, "good-e2e-creator");
    const plan = page.getByTestId("elevenlabs-plan");
    await expect(plan).toContainText("Plan: creator");
    await expect(plan).toContainText("12,000 of 100,000 characters used this month");
    await expect(plan).toContainText("Voice cloning is on your plan");
    const card = page.locator(".card", { has: plan });
    await expect(card.locator(".status-pill")).toContainText("Connected");
    await expect(card.getByRole("button", { name: "Disconnect" })).toBeVisible();

    // Save the consented sample → the voice row gains the premium clone
    await page.goto("/voice");
    await page.getByLabel("Upload a voice clip").setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: wav(65) });
    await expect(page.getByTestId("sample-length")).toContainText("1:05");
    await page.getByLabel(/This is my own voice and I consent/).check();
    await page.getByRole("button", { name: "Save my voice" }).click();
    await expect(page.locator(".toast")).toContainText("Your premium voice is ready too");
    await expect(page.getByText(/Voice ready · saved/)).toBeVisible();
    const [row] = sql<{ v: string | null }>("SELECT elevenlabs_voice_id AS v FROM voice WHERE id = 1");
    expect(row.v).toMatch(/^fake_voice_/);
    await expect(engine.locator(".engine-tag")).toHaveText("In use: Premium");
    await expect(engine.getByText("ElevenLabs is connected and your premium voice is ready.")).toBeVisible();

    // Narrate → Premium, ready at once, and it plays
    await generate(page, "Welcome back to the table, friends. Today is all about spring.");
    await expect(page.locator(".toast").last()).toContainText("Your premium narration is ready below");
    await expect(newest(page).locator(".engine-tag")).toHaveText("Premium");
    const player = newest(page).getByLabel("Play narration");
    await expect(player).toBeVisible();
    const src = await player.getAttribute("src");
    const audio = await page.request.get(src!);
    expect(audio.status()).toBe(200);
    expect(audio.headers()["content-type"]).toBe("audio/mpeg");
    const seconds = await player.evaluate(
      (el: HTMLAudioElement) =>
        new Promise<number>((resolve) => {
          el.preload = "auto";
          el.addEventListener("loadedmetadata", () => resolve(el.duration), { once: true });
          el.addEventListener("error", () => resolve(-1), { once: true });
          el.load();
        }),
    );
    expect(seconds).toBeGreaterThan(0.9);

    // Credits used up → falls back to Built-in with a plain toast
    await disconnect(page);
    await connect(page, "good-quota-e2e");
    await expect(page.getByTestId("elevenlabs-plan")).toContainText("30,000 of 30,000");
    await generate(page, "This one should use the built-in voice because credits are gone.");
    await expect(page.locator(".toast").last()).toContainText("Your ElevenLabs credits are used up, so this narration uses your built-in voice.");
    await expect(newest(page).locator(".engine-tag")).toHaveText("Built-in");

    // Disconnected → Built-in, no fallback toast needed
    await disconnect(page);
    await generate(page, "Disconnected now, so the free voice does this narration.");
    await expect(page.locator(".toast").last()).toContainText("Generating.");
    await expect(newest(page).locator(".engine-tag")).toHaveText("Built-in");
    await expect(engine.getByRole("link", { name: "Connect ElevenLabs for the premium voice" })).toBeVisible();

    // Connected again but the switch is off → Built-in
    await connect(page, "good-e2e-creator");
    await page.goto("/voice");
    await expect(engine.locator(".engine-tag")).toHaveText("In use: Premium");
    await engine.getByLabel(/Use premium voice when connected/).uncheck();
    await expect(engine.locator(".engine-tag")).toHaveText("In use: Built-in");
    await expect(engine.getByText(/You chose the built-in voice/)).toBeVisible();
    await generate(page, "The switch is off, so the built-in voice is used even though it is connected.");
    await expect(newest(page).locator(".engine-tag")).toHaveText("Built-in");

    // every narration row carries its engine
    const engines = sql<{ engine: string; n: number }>("SELECT engine, COUNT(*) AS n FROM narrations GROUP BY engine ORDER BY engine");
    expect(engines).toEqual([
      { engine: "built-in", n: 3 },
      { engine: "elevenlabs", n: 1 },
    ]);
  });

  test("a bad key is refused with a fix link; the Voice · ElevenLabs light is named in words", async ({ page }) => {
    await connect(page, "bad-e2e-key-123");
    await expect(page.locator(".toast.bad")).toContainText("ElevenLabs says this key is not valid.");
    await expect(page.locator(".toast.bad").getByRole("link", { name: "How to fix" })).toHaveAttribute("href", "/help/connect-elevenlabs");
    await disconnect(page);
    await page.goto("/settings");
    await expect(page.locator('[data-health="Voice · ElevenLabs"]')).toContainText("Voice · ElevenLabs");
    await expect(page.locator('[data-health="Voice · ElevenLabs"]')).toContainText("Not connected");
  });
});
