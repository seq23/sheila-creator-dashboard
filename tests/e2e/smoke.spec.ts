import { expect, test } from "@playwright/test";

test.describe("login", () => {
  // These tests exercise the login flow itself, so they start without the shared session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login page shows the brand and asks for an email", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sheila Studio" })).toBeVisible();
    await expect(page.getByLabel("Your email")).toBeVisible();
  });

  test("a code from the email logs her in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your email").fill("asheilabruceaffair@gmail.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    const code = await page.locator(".notice strong").textContent();
    await page.getByLabel("The code from your email").fill(code!.trim());
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible();
  });

  test("an unknown email gets the same answer and no code", async ({ page }) => {
    const res = await page.request.post("/api/auth/request", { data: { email: "stranger@example.com" } });
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });
});

test.describe("home and dump", () => {
  test("home shows runway, this week, waiting and health, and the big Dump button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Runway")).toBeVisible();
    await expect(page.getByText("This week")).toBeVisible();
    await expect(page.getByText("Waiting for you")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ Dump videos" })).toBeVisible();
  });

  test("every screen is reachable and has a ? help button", async ({ page }) => {
    for (const path of ["/dump", "/review", "/calendar", "/brain", "/research", "/stats", "/settings", "/settings/connections", "/deals", "/help"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Help for this screen" }), path).toBeVisible();
    }
  });

  test("dump: pick a door, upload a small file in chunks, Dump is gated on the brief", async ({ page }) => {
    await page.goto("/dump");
    await page.getByRole("button", { name: /Recycle old videos/ }).click();
    // Random bytes: the dashboard refuses a file it has already seen (never re-upload the identical video).
    const bytes = Buffer.alloc(300_000);
    for (let i = 0; i < bytes.length; i += 4) bytes.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
    await page.locator('input[type="file"]').setInputFiles({ name: "sample.mp4", mimeType: "video/mp4", buffer: bytes });
    await expect(page.getByText("Uploaded")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Notes for this dump").fill("Test dump from Playwright");
    await page.getByRole("button", { name: "Dump", exact: true }).click();
    // Section 6 gate: no Brand Profile locked yet → a plain-English stop with a fix link.
    await expect(page.locator(".toast.bad")).toContainText("Brand Profile");
    await expect(page.locator(".toast.bad").getByRole("link", { name: "How to fix" })).toBeVisible();
  });

  test("settings: caps stop at 10 and save", async ({ page }) => {
    await page.request.patch("/api/settings", { data: { weekly_caps: { tiktok: 10, instagram: 7, youtube: 5 } } });
    await page.goto("/settings");
    const more = page.getByRole("button", { name: "More TikTok posts per week" });
    await expect(more).toBeDisabled();
    await page.getByRole("button", { name: "Fewer YouTube Shorts posts per week" }).click();
    await expect(page.locator(".toast").first()).toContainText("Saved");
  });

  test("connect: a bad Buffer key is refused with a fix link, a good one lists channels", async ({ page }) => {
    await page.request.post("/api/connections/buffer/disconnect"); // start clean whatever an earlier project did
    await page.goto("/settings/connections");
    await page.getByLabel("Posting · Buffer key").fill("bad-key-000000");
    await page.getByRole("button", { name: "Check key" }).first().click();
    await expect(page.locator(".toast.bad")).toContainText("not valid");
    await page.getByLabel("Posting · Buffer key").fill("good-key-ig-missing");
    await page.getByRole("button", { name: "Check key" }).first().click();
    await expect(page.getByText("Channels we found in your Buffer")).toBeVisible();
    await expect(page.getByText("Needs reconnect in Buffer")).toBeVisible();
  });
});

test.describe("public", () => {
  test("the media kit page needs no login", async ({ page }) => {
    await page.goto("/kit/sheila");
    await expect(page.getByRole("heading", { name: "Sheila Bruce" })).toBeVisible();
  });
  test("a media link with a bad token is a 404, not a crash", async ({ page }) => {
    const res = await page.request.get("/media/notavalidtokenatall000000000000000000");
    expect(res.status()).toBe(404);
  });
});

test.describe("guard rails", () => {
  test("the identical video is refused the second time", async ({ page }) => {
    const bytes = Buffer.alloc(120_000);
    for (let i = 0; i < bytes.length; i += 4) bytes.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
    const upload = async () => {
      await page.goto("/dump");
      await page.locator('input[type="file"]').setInputFiles({ name: "same.mp4", mimeType: "video/mp4", buffer: bytes });
      await expect(page.getByText(/Uploaded|Failed/)).toBeVisible({ timeout: 20_000 });
      return page.getByText("Uploaded").isVisible();
    };
    expect(await upload()).toBe(true);
    expect(await upload()).toBe(false);
  });
});
