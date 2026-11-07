// Checklist 2: Buffer is connected on Connect (vault `buffer-access-token`). The app checks it
// live ("Check again") and every channel the client has connected in Buffer comes back green.
// The channels are read at runtime from what Buffer reports, never a fixed list. If a run finds
// Buffer not connected, it pastes the vault key through the same screen. No channel connected is
// a NAMED STOP (BUFFER_NO_CHANNELS), never a pass.
import { expect, test } from "@playwright/test";
import { d1, evidence, shot, vaultSecret } from "./helpers";

test("2 · Buffer connected: every connected channel found, all green", async ({ page }) => {
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
  const [conn] = d1<{ status: string; meta: string; last_ok_at: string }>("SELECT status, meta, last_ok_at FROM connections WHERE service = 'buffer'");
  expect(conn?.status).toBe("ok");
  const meta = JSON.parse(conn!.meta) as { organization_id: string; channels: { platform: string; handle: string; connected: boolean; paused?: boolean }[] };
  expect(meta.channels.length, "NAMED STOP BUFFER_NO_CHANNELS: Buffer is connected but has no channel; the client connects TikTok, Instagram or YouTube in Buffer").toBeGreaterThan(0);
  const NAME: Record<string, string> = { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };
  const channels = page.locator(".card", { hasText: "Channels we found in your Buffer" });
  for (const c of meta.channels) {
    await expect(channels.locator(".list-row", { hasText: NAME[c.platform]! })).toContainText(`${c.handle} · posting OK`);
  }
  // a platform the client has not connected says so, with its fix; never a silent gap
  for (const p of Object.keys(NAME).filter((p) => !meta.channels.some((c) => c.platform === p))) {
    await expect(channels.locator(".list-row", { hasText: NAME[p]! })).toContainText("Not added in Buffer yet");
  }
  await expect(channels).not.toContainText("Needs reconnect in Buffer");
  const file = await shot(page, "02-buffer-channels", { fullPage: true });

  expect(meta.channels.every((c) => c.connected && !c.paused)).toBe(true);
  evidence("2-buffer", { screenshot: file, organization_id: meta.organization_id, channels: meta.channels.length, last_ok_at: conn!.last_ok_at });
});
