// Phase 10 (brand deals + media kit), 11 (voice) and 12c (help center + tour), at phone and
// desktop sizes, with fake services and demo data (tests/e2e/seed-demo.sql).
import { expect, test, type Page } from "@playwright/test";
import { clearDemo, seedDemo, setVoice, TOUR_OFF } from "./demo";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => seedDemo());
test.afterAll(async ({ playwright }, info) => {
  const ctx = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: "test-results/.auth/owner.json" });
  await setVoice(ctx, false).catch(() => undefined);
  await ctx.dispose();
  clearDemo();
});

async function runFinder(page: Page) {
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/deals/finder/run") && r.request().method() === "POST"), page.getByRole("button", { name: "Find brands now" }).click()]);
  expect(res.status()).toBe(200);
  const { jobId } = (await res.json()) as { jobId: string };
  const fake = await page.request.post(`/api/jobs/${jobId}/run-fake`, { data: {} });
  expect(fake.ok()).toBe(true);
  await page.reload();
}

function openBrand(page: Page, name: string) {
  return page.locator(".brand-card", { hasText: name }).click();
}

test.describe("brand deals", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_OFF);
  });

  test("the finder fills brand cards with public contacts and never suggests an off-limits brand", async ({ page }) => {
    await page.goto("/deals");
    await expect(page.getByRole("heading", { name: "Brand deals" })).toBeVisible();
    await runFinder(page);
    await expect(page.locator(".brand-card", { hasText: "Cedar & Salt Kitchen" })).toBeVisible();
    await expect(page.locator(".brand-card", { hasText: "Velvet & Vine Wraps" })).toBeVisible();
    // "Alcohol" is on the demo profile's off-limits list.
    await expect(page.locator(".brand-card", { hasText: "Midnight Spirits" })).toHaveCount(0);
    const api = (await (await page.request.get("/api/deals")).json()) as { brands: { name: string; contacts: { value: string; found_on_url: string }[] }[]; marketplace: { summary: string } };
    expect(api.brands.map((b) => b.name)).not.toContain("Midnight Spirits Co.");
    for (const b of api.brands) for (const c of b.contacts) expect(c.found_on_url).toMatch(/^https?:\/\//);
    // Marketplace eligibility is computed from the latest account stats and shown.
    await expect(page.getByText("TikTok One (Creator Marketplace)")).toBeVisible();
    await expect(page.getByText(/Not yet: .*posts in the last 30 days 0 of 3/)).toBeVisible();
    // A personal address from the job is refused even if the job sends one.
    const run = await page.request.post("/api/deals/finder/run");
    const { jobId } = (await run.json()) as { jobId: string };
    await page.request.post(`/api/jobs/${jobId}/run-fake`, { data: { failure: "bad_contacts" } });
    const after = (await (await page.request.get("/api/deals")).json()) as { brands: { contacts: { value: string }[] }[] };
    expect(after.brands.flatMap((b) => b.contacts.map((c) => c.value))).not.toContain("jane.doe@gmail.com");
  });

  test("draft a pitch, Open in Gmail is pre-filled, mark sent, and the follow-up shows on Home", async ({ page }) => {
    await page.goto("/deals");
    await openBrand(page, "Cedar & Salt Kitchen");
    await expect(page.getByText("pr@cedarandsalt.example")).toBeVisible();
    await page.getByRole("button", { name: "Draft a pitch" }).click();
    const subject = page.getByLabel("Subject");
    await expect(subject).toHaveValue(/Cedar & Salt Kitchen/);
    const href = await page.getByRole("link", { name: "Open in Gmail" }).getAttribute("href");
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("pr@cedarandsalt.example");
    expect(url.searchParams.get("su")).toBe(await subject.inputValue());
    expect(url.searchParams.get("body")).toContain("/kit/sheila");
    expect(url.searchParams.get("body")).toContain("/media/demotoken");
    expect(href).not.toContain("+"); // spaces are %20 so Gmail shows them as spaces

    // Her edit is saved and goes into the Gmail link.
    await subject.fill("Brunch tables × Cedar & Salt");
    await page.getByRole("tab", { name: "DM" }).click();
    await page.getByRole("tab", { name: "Email" }).click();
    await expect(page.getByLabel("Subject")).toHaveValue("Brunch tables × Cedar & Salt");
    expect(new URL((await page.getByRole("link", { name: "Open in Gmail" }).getAttribute("href"))!).searchParams.get("su")).toBe("Brunch tables × Cedar & Salt");

    await page.getByRole("button", { name: "Mark as sent" }).click();
    const dialog = page.getByRole("dialog", { name: "Mark as sent" });
    const fourDaysAgo = new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10);
    await dialog.getByLabel("When did you send it?").fill(fourDaysAgo);
    await dialog.getByRole("button", { name: "Yes, I sent it" }).click();
    await expect(page.locator(".toast").first()).toContainText("Marked as sent");
    await expect(page.locator(".tracker")).toContainText("Sent");

    await page.goto("/");
    const followups = page.locator("section", { has: page.getByRole("heading", { name: "Follow-ups" }) });
    await expect(followups).toContainText("Cedar & Salt Kitchen");

    // The Monday recap carries the same follow-up (sent 4 days ago → due tomorrow): the lane
    // runs its follow-ups query over these rows and records the email. The line's wording is
    // pinned in tests/unit/deals-domain.test.ts; emails_sent keeps only the subject.
    const before = ((await (await page.request.get("/api/settings")).json()) as { features: { weekly_recap: boolean } }).features;
    expect((await page.request.patch("/api/settings", { data: { features: { ...before, weekly_recap: true } } })).ok()).toBe(true);
    try {
      expect((await page.request.get("/cdn-cgi/handler/scheduled?cron=0+12+*+*+1")).ok()).toBe(true);
      await expect.poll(() => sql<{ n: number }>("SELECT COUNT(*) AS n FROM emails_sent WHERE kind = 'weekly_recap'")[0]?.n ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
    } finally {
      // The lane also queued the metrics and brand-finder jobs; a queued finder would make the
      // next project's "Find brands now" refuse, so put back what the trigger created.
      await page.request.patch("/api/settings", { data: { features: before } });
      sql("DELETE FROM emails_sent WHERE kind = 'weekly_recap'; DELETE FROM jobs WHERE type IN ('metrics','brand_finder') AND status = 'dispatched'");
    }
  });

  test("they replied stops follow-ups; a won deal takes deliverables", async ({ page }) => {
    await page.goto("/deals");
    await openBrand(page, "Petal Post Florals");
    await page.getByRole("button", { name: "They replied" }).click();
    await expect(page.locator(".tracker")).toContainText("Replied");
    await expect(page.locator(".tracker .pill.warn")).toHaveCount(0);
    await page.getByRole("button", { name: "We have a deal" }).click();
    await expect(page.getByRole("heading", { name: "What you owe them" })).toBeVisible();
    const due = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
    await page.getByLabel("Due date", { exact: true }).fill(due);
    await page.getByLabel("Note", { exact: true }).fill("One unboxing video");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".deliverables .list-row")).toContainText("One unboxing video");
    // A stage the funnel does not allow is refused with a fix guide.
    const d = (await (await page.request.get("/api/deals")).json()) as { brands: { name: string; deal: { id: string } | null }[] };
    const dealId = d.brands.find((b) => b.name === "Petal Post Florals")!.deal!.id;
    const bad = await page.request.post(`/api/deals/deals/${dealId}/stage`, { data: { stage: "found" } });
    expect(bad.status()).toBe(409);
    expect(((await bad.json()) as { fix_guide?: string }).fix_guide).toBe("mark-a-reply");
  });

  test("media kit: she edits it, and the public page shows her clips, numbers and themes", async ({ page, browser }) => {
    await page.goto("/deals?tab=kit");
    const bio = page.locator(".kit-editor textarea");
    await bio.fill("Hosting and table styling for women who love to gather. (edited)");
    await page.getByRole("button", { name: "Save media kit" }).click();
    await expect(page.locator(".toast").first()).toContainText("Media kit saved");

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined });
    const pub = await anon.newPage();
    await pub.goto("/kit/sheila");
    await expect(pub.getByRole("heading", { name: "Sheila Bruce" })).toBeVisible();
    await expect(pub.getByText("(edited)")).toBeVisible();
    await expect(pub.locator(".kit-clip video")).toHaveCount(3);
    await expect(pub.getByText("Table styling", { exact: true })).toBeVisible();
    await expect(pub.getByText("12.4K")).toBeVisible();
    await expect(pub.getByRole("link", { name: "Work with me" })).toHaveAttribute("href", /^mailto:partnerships@demo-creator\.example/);
    const hasScroll = await pub.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasScroll).toBe(false);
    const print = await pub.request.get("/api/public/kit/sheila/print");
    expect(print.status()).toBe(200);
    expect(print.headers()["content-type"]).toContain("text/html");
    const html = await print.text();
    expect(html).toContain("Top clips");
    expect(html).toContain("@media print");
    await anon.close();
  });
});

test.describe("voice", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_OFF);
  });

  test("hidden and refused while off; consented sample, generate, listen, delete", async ({ page }) => {
    await setVoice(page.request, false);
    const off = await page.request.post("/api/voice/narrations", { data: { script: "Hello there, this is a test script." } });
    expect(off.status()).toBe(409);
    expect(((await off.json()) as { fix_guide?: string }).fix_guide).toBe("record-your-voice");
    await page.goto("/voice");
    await expect(page.getByText("Voice narration is off")).toBeVisible();

    await setVoice(page.request, true);
    await page.goto("/voice");
    await page.getByLabel("Upload a voice clip").setInputFiles({ name: "sample.wav", mimeType: "audio/wav", buffer: wav(1) });
    const save = page.getByRole("button", { name: "Save my voice" });
    await expect(save).toBeDisabled(); // consent first
    await page.getByLabel(/This is my own voice and I consent/).check();
    await save.click();
    await expect(page.getByText(/Voice ready · saved/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Draft with AI" }).click();
    await expect(page.getByLabel("Script")).toHaveValue(/Hi, it's Sheila/);
    const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/voice/narrations") && r.request().method() === "POST"), page.getByRole("button", { name: "Generate" }).click()]);
    const { jobId, id } = (await res.json()) as { jobId: string; id: string };
    expect((await page.request.post(`/api/jobs/${jobId}/run-fake`, { data: {} })).ok()).toBe(true);
    await page.reload();
    await expect(page.getByLabel("Play narration")).toBeVisible();
    const audio = await page.request.get(`/api/voice/narrations/${id}/audio`);
    expect(audio.status()).toBe(200);
    expect(audio.headers()["content-type"]).toContain("audio/wav");
    expect((await audio.body()).subarray(0, 4).toString()).toBe("RIFF");

    await page.getByRole("button", { name: "Delete my voice" }).click();
    await page.getByRole("button", { name: "Yes, delete my voice" }).click();
    await expect(page.getByText(/Voice ready · saved/)).toHaveCount(0);
    const state = (await (await page.request.get("/api/voice")).json()) as { hasSample: boolean };
    expect(state.hasSample).toBe(false);
    await setVoice(page.request, false);
  });
});

test.describe("help center", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_OFF);
  });

  test("a guide shows its steps, Back / Next, and Did this work? posts feedback", async ({ page }) => {
    await page.goto("/help/send-a-pitch");
    await expect(page.getByRole("heading", { name: "Send a pitch", level: 1 })).toBeVisible();
    await expect(page.getByText("Step 1 of 6")).toBeVisible();
    await expect(page.locator(".guide-screen-only .guide-shot")).toBeVisible();
    for (let i = 2; i <= 6; i++) {
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByText(`Step ${i} of 6`)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Step 5 of 6")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    const [fb] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/help/feedback")), page.getByRole("button", { name: "Yes", exact: true }).click()]);
    expect(fb.status()).toBe(200);
    expect(fb.request().postDataJSON()).toMatchObject({ slug: "send-a-pitch", worked: true });
    await expect(page.getByText("Great. You can close this guide.")).toBeVisible();
  });

  test("No opens the guide's fix-it guide", async ({ page }) => {
    await page.goto("/help/mark-a-reply?step=5");
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("button", { name: "No, show me a fix" }).click();
    await expect(page).toHaveURL(/\/help\/send-a-pitch$/);
  });

  test("help home: search finds guides, and Getting Started ticks are remembered", async ({ page }) => {
    await page.goto("/help");
    await page.getByPlaceholder("What do you need help with?").fill("gmail");
    await expect(page.getByRole("region", { name: "Search results" }).getByText("Send a pitch")).toBeVisible();
    await page.getByPlaceholder("What do you need help with?").fill("");
    await page.getByRole("button", { name: "Tick Log in" }).click();
    await expect(page.getByText(/1 of 7 done/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Untick Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "A post failed" })).toBeVisible();
  });
});

test.describe("first-login tour", () => {
  test("shows once on Home, walks five stops, and Replay the tour brings it back", async ({ page }) => {
    await page.goto("/");
    const tour = page.getByRole("dialog", { name: "Quick tour" });
    await expect(tour).toBeVisible();
    const stops = ["Dump", "Review", "Calendar", "Deals", "Help"];
    for (const [i, s] of stops.entries()) {
      await expect(tour.getByRole("heading", { name: s })).toBeVisible();
      await expect(tour).toContainText(`${i + 1} of 5`);
      await tour.getByRole("button", { name: i === stops.length - 1 ? "Done" : "Next" }).click();
    }
    await expect(tour).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Quick tour" })).toHaveCount(0);

    await page.goto("/help");
    await page.getByRole("button", { name: "Replay the tour" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog", { name: "Quick tour" })).toBeVisible();
    await page.getByRole("button", { name: "Skip tour" }).click();
    await expect(page.getByRole("dialog", { name: "Quick tour" })).toHaveCount(0);
  });
});

/** A short mono 16-bit WAV (a quiet tone) so the upload is a real audio file. */
function wav(seconds: number): Buffer {
  const rate = 16_000;
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
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 6000), 44 + i * 2);
  return b;
}
