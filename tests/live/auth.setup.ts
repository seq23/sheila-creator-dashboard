// Logs in to staging ONCE through the real login screen with the real emailed code, read back
// from Resend, and saves the session. Later runs reuse it while /api/auth/me still answers 200,
// because the login-code limit (5 per 15 minutes) is a real control the suite must not burn.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { LIVE_STORAGE } from "../../playwright.live.config";
import { OWNER, evidence, waitForEmail } from "./helpers";

setup("log in as the owner with a real emailed code", async ({ page, browser, baseURL }) => {
  // The sample (26 Sep 2026) has no login: every visitor is the owner, so the saved session is empty.
  {
    const ctx = await browser.newContext({ baseURL });
    const me = await ctx.request.get("/api/me");
    await ctx.close();
    if (me.ok()) {
      mkdirSync(path.dirname(LIVE_STORAGE), { recursive: true });
      const empty = await browser.newContext({ baseURL });
      await empty.storageState({ path: LIVE_STORAGE });
      await empty.close();
      evidence("1-login", { mode: "open", note: "no login on the sample; /api/me answered 200 with no cookie" });
      return;
    }
  }
  if (existsSync(LIVE_STORAGE) && !process.env.LIVE_FRESH_LOGIN) {
    const ctx = await browser.newContext({ storageState: LIVE_STORAGE, baseURL });
    const me = await ctx.request.get("/api/auth/me");
    await ctx.close();
    if (me.ok()) return; // the saved session still works
  }
  mkdirSync(path.dirname(LIVE_STORAGE), { recursive: true });
  await page.goto("/");
  await page.getByLabel("Your email").fill(OWNER);
  const since = Date.now() - 5_000;
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("The code from your email")).toBeVisible();
  const email = await waitForEmail(/^\d{6} is your /, since);
  const code = `${email.text ?? ""} ${email.html ?? ""}`.match(/login code is (\d{6})/)?.[1];
  expect(code, "the emailed code").toBeTruthy();
  await page.getByLabel("The code from your email").fill(code!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible();
  await page.context().storageState({ path: LIVE_STORAGE });
  evidence("1-login", { resend_email_id: email.id, last_event: email.last_event });
});
