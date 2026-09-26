// Checklist 1: logged in on staging with a real emailed code; Home renders as the owner.
import { expect, test } from "@playwright/test";
import { OWNER, d1, evidence, shot } from "./helpers";

test("1 · Home renders as the owner after the emailed-code login", async ({ page }) => {
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.email).toBe(OWNER);
  expect(me.role).toBe("owner");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible();
  const file = await shot(page, "01-home");
  const [row] = d1<{ provider_id: string | null }>("SELECT provider_id FROM emails_sent WHERE kind = 'login_code' ORDER BY sent_at DESC LIMIT 1");
  expect(row?.provider_id, "the last login code went out through Resend").toBeTruthy();
  const [mail] = d1<{ light: string }>("SELECT light FROM health WHERE name = 'Email (Resend)'");
  expect(mail?.light).toBe("green");
  evidence("1-login", { screenshot: file, last_login_provider_id: row!.provider_id, role: me.role });
});
