// Checklist 2: the throwaway Buffer account is connected on Connect (the owner pasted its new
// key herself on 25 Sep 2026; vault `buffer-access-token` holds the same key, expiring
// 25 Sep 2027). The app checks it live ("Check again") and all three channels come back green.
// If a run finds Buffer not connected, it pastes the vault key through the same screen.
import { expect, test } from "@playwright/test";
import { d1, evidence, shot, vaultSecret } from "./helpers";

test("2 · Buffer connected with the throwaway key: three channels found, all green", async ({ page }) => {
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Buffer", exact: true }) });
  const again = card.getByRole("button", { name: "Check again" });
  await expect(card.getByRole("button", { name: /^(Check again|Check key)$/ })).toBeVisible(); // loaded
  if (await again.isVisible()) {
    await again.click();
    await expect(page.getByText("Still working.")).toBeVisible({ timeout: 30_000 });
  } else {
    await card.getByLabel("Posting · Buffer key").fill(vaultSecret("buffer-access-token"));
    await card.getByRole("button", { name: "Check key" }).click();
    await expect(page.getByText("Buffer connected.")).toBeVisible({ timeout: 30_000 });
  }
  await expect(card).toContainText("Connected");
  const channels = page.locator(".card", { hasText: "Channels we found in your Buffer" });
  for (const [platform, handle] of [
    ["TikTok", "iamcindymercer"],
    ["Instagram", "seq23"],
    ["YouTube", "Sequoia Taylor"],
  ]) {
    await expect(channels.locator(".list-row", { hasText: platform })).toContainText(`${handle} · posting OK`);
  }
  await expect(channels).not.toContainText("Not added in Buffer yet");
  await expect(channels).not.toContainText("Needs reconnect in Buffer");
  const file = await shot(page, "02-buffer-channels", { fullPage: true });

  const [conn] = d1<{ status: string; meta: string; last_ok_at: string }>("SELECT status, meta, last_ok_at FROM connections WHERE service = 'buffer'");
  expect(conn?.status).toBe("ok");
  const meta = JSON.parse(conn!.meta) as { organization_id: string; channels: { platform: string; connected: boolean; paused?: boolean }[] };
  expect(meta.channels.map((c) => c.platform).sort()).toEqual(["instagram", "tiktok", "youtube"]);
  expect(meta.channels.every((c) => c.connected && !c.paused)).toBe(true);
  evidence("2-buffer", { screenshot: file, organization_id: meta.organization_id, channels: meta.channels.length, last_ok_at: conn!.last_ok_at });
});
