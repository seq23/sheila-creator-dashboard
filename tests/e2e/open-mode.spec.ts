// Open mode (AUTH_MODE "open"), the way production runs by the owner's choice: she opens the
// URL and her dashboard is there. No login page, no login API, no cookie needed. Runs on its own
// server and port through playwright.open.config.ts (npm run e2e:open); the code-mode suite keeps
// proving the email-code login that staging uses.
import { sql } from "./helpers";
import { expect, test } from "@playwright/test";

const OWNER = "asheilabruceaffair@gmail.com";

test.describe("open mode: no login at all", () => {
  test("the server says it is open: /api/me is the owner with no cookie", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ email: OWNER, role: "owner", authMode: "open" });
  });

  test("/ renders Home as the owner, straight away, with no login form", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hi Sheila" })).toBeVisible();
    await expect(page.getByText("Runway")).toBeVisible();
    await expect(page.getByRole("link", { name: "+ Dump videos" })).toBeVisible();
    await expect(page.getByLabel("Your email")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a code" })).toHaveCount(0);
    // Nothing had to be stored to get in.
    expect((await context.cookies()).filter((c) => c.name === "ss_session")).toEqual([]);
  });

  test("/login lands on Home", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Hi Sheila" })).toBeVisible();
    await expect(page.locator(".login-card")).toHaveCount(0);
  });

  test("the login API is gone: /api/auth/request, /verify and /me are 404", async ({ request }) => {
    expect((await request.post("/api/auth/request", { data: { email: OWNER } })).status()).toBe(404);
    expect((await request.post("/api/auth/verify", { data: { email: OWNER, code: "123456" } })).status()).toBe(404);
    expect((await request.get("/api/auth/me")).status()).toBe(404);
  });

  test("the app shows no log-out and no email-code text anywhere she can go", async ({ page }) => {
    for (const path of ["/", "/settings", "/help"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first(), path).toBeVisible();
      await expect(page.getByText(/log ?out|sign ?out|email me a code|6-digit code/i), path).toHaveCount(0);
    }
  });

  test("Help has no Log in guide, and its old link goes back to Help", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Getting started" })).toBeVisible();
    // The checklist rendered (so the absence below is real), without its old first step.
    await expect(page.locator('a[href="/help/connect-buffer"]').first()).toBeVisible();
    await expect(page.locator('a[href="/help/log-in"]')).toHaveCount(0);
    // Search finds guides, never the login one.
    await page.getByLabel("What do you need help with?").fill("log in");
    await expect(page.locator('section[aria-label="Search results"] a').first()).toBeVisible();
    await expect(page.locator('a[href="/help/log-in"]')).toHaveCount(0);
    await page.goto("/help/log-in");
    await expect(page).toHaveURL(/\/help$/);
  });

  test("Dump works: pick a door, upload a small file", async ({ page }) => {
    await page.goto("/dump");
    await expect(page.getByRole("heading", { name: "Dump videos" })).toBeVisible();
    await page.getByRole("radio", { name: /Old posts to reuse/ }).click();
    const bytes = Buffer.alloc(200_000);
    for (let i = 0; i < bytes.length; i += 4) bytes.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);
    await page.locator('input[type="file"]').setInputFiles({ name: "open-mode.mp4", mimeType: "video/mp4", buffer: bytes });
    await expect(page.getByText("Uploaded")).toBeVisible({ timeout: 20_000 });
  });

  test("Settings works: a change saves as the owner", async ({ page }) => {
    await page.request.patch("/api/settings", { data: { weekly_caps: { tiktok: 10, instagram: 7, youtube: 5 } } });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "More TikTok posts per week" })).toBeDisabled();
    await page.getByRole("button", { name: "Fewer YouTube Shorts posts per week" }).click();
    await expect(page.locator(".toast").first()).toContainText("Saved");
    // The helper is who "Email my helper" writes to, not a second login.
    await expect(page.getByText("Your helper")).toBeVisible();
    await expect(page.getByText("Helper login")).toHaveCount(0);
  });

  test("public routes are unchanged: the media kit and media links", async ({ page }) => {
    // A draft is never public: nothing shows until she publishes (as the owner, with no login).
    sql("DELETE FROM media_kit_versions");
    await page.goto("/kit/sheila");
    await expect(page.getByRole("heading", { name: "No media kit here" })).toBeVisible();
    expect((await page.request.post("/api/mediakit/publish")).ok()).toBe(true);
    await page.goto("/kit/sheila");
    await expect(page.getByRole("heading", { name: "Sheila Bruce" })).toBeVisible();
    expect((await page.request.get("/media/notavalidtokenatall000000000000000000")).status()).toBe(404);
  });
});
