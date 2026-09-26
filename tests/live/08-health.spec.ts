// Checklist 8: Health + emails on staging, for real.
//
// The break is a REAL revoked Buffer key: the owner regenerated the throwaway account's key on
// 25 Sep 2026, which revoked the one staging held. (The app's own Disconnect button is her
// choice, so it is "off", never "bad", and rightly sends no email; a key Buffer refuses is the
// failure that must email her.) Run `LIVE_HEALTH=break` while the stored key is dead, then
// 02-buffer.spec.ts reconnects, then the default mode proves the light is green again.
import { expect, test } from "@playwright/test";
import { d1, emailsSince, evidence, shot, waitForEmail } from "./helpers";

const NEEDS_YOU = /^Buffer needs you/;

test.describe.configure({ mode: "serial" });

test("8a · a Buffer key Buffer refuses: red light + one 'Buffer needs you' email", async ({ page }) => {
  test.skip(process.env.LIVE_HEALTH !== "break", "run with LIVE_HEALTH=break while the stored Buffer key is revoked");
  const since = Date.now() - 5_000;
  await page.goto("/settings");
  await page.getByRole("button", { name: "Check everything now" }).click();
  const row = page.locator('[data-health="Buffer"]');
  await expect(row).toContainText("Not working");
  await expect(row.getByRole("link", { name: "How to fix" })).toBeVisible();
  const file = await shot(page, "08-buffer-red");
  const mail = await waitForEmail(NEEDS_YOU, since);
  expect(`${mail.text}`).toMatch(/help\/reconnect-buffer/);
  // A second check while it is still broken must not email again.
  await page.getByRole("button", { name: "Check everything now" }).click();
  await expect(page.getByText("Checked everything.")).toBeVisible();
  await page.waitForTimeout(20_000);
  expect((await emailsSince(NEEDS_YOU, since)).length, "exactly one 'needs you' email per break").toBe(1);
  evidence("8-health", { red_screenshot: file, needs_you_email_id: mail.id, needs_you_emails: 1 });
});

test("8b · after reconnecting, Check everything now turns Buffer and every channel green", async ({ page }) => {
  test.skip(process.env.LIVE_HEALTH === "break", "the break half runs alone");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Check everything now" }).click();
  await expect(page.getByText("Checked everything.")).toBeVisible();
  for (const name of ["Buffer", "TikTok (via Buffer)", "Instagram (via Buffer)", "YouTube (via Buffer)", "Email (Resend)", "Job runner (GitHub)"]) {
    await expect(page.locator(`[data-health="${name}"]`), name).toContainText("Working");
  }
  const file = await shot(page, "08-health-green", { fullPage: true });
  const rows = d1<{ name: string; light: string }>("SELECT name, light FROM health WHERE name IN ('Buffer','TikTok (via Buffer)','Instagram (via Buffer)','YouTube (via Buffer)')");
  expect(rows.every((r) => r.light === "green")).toBe(true);
  evidence("8-health", { green_screenshot: file });
});
