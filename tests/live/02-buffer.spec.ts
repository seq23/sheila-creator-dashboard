// Checklist 2: connect the throwaway Buffer account through Connect. Disconnect whatever is
// stored, paste the key (vault `buffer-access-token`, the throwaway account's key since
// 25 Sep 2026; never printed), Check key, and all three channels come back green.
import { expect, test } from "@playwright/test";
import { d1, evidence, shot, vaultSecret } from "./helpers";

test("2 · Disconnect, paste the throwaway Buffer key, three channels found", async ({ page }) => {
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Buffer", exact: true }) });
  const disconnect = card.getByRole("button", { name: "Disconnect" });
  if (await disconnect.isVisible()) {
    await disconnect.click();
    await expect(card.getByLabel("Posting · Buffer key")).toBeVisible();
  }
  const [gone] = d1<{ n: number }>("SELECT COUNT(*) AS n FROM connections WHERE service = 'buffer' AND secret_enc IS NOT NULL");
  expect(gone?.n, "the old key is gone before a new one goes in").toBe(0);

  await card.getByLabel("Posting · Buffer key").fill(vaultSecret("buffer-access-token"));
  await card.getByRole("button", { name: "Check key" }).click();
  await expect(page.getByText("Buffer connected.")).toBeVisible({ timeout: 30_000 });
  const channels = page.locator(".card", { hasText: "Channels we found in your Buffer" });
  for (const [platform, handle] of [
    ["TikTok", "iamcindymercer"],
    ["Instagram", "seq23"],
    ["YouTube", "Sequoia Taylor"],
  ]) {
    const row = channels.locator(".list-row", { hasText: platform });
    await expect(row).toContainText(`${handle} · posting OK`);
  }
  await expect(channels).not.toContainText("Not added in Buffer yet");
  const file = await shot(page, "02-buffer-channels", { fullPage: true });

  const [conn] = d1<{ status: string; meta: string }>("SELECT status, meta FROM connections WHERE service = 'buffer'");
  expect(conn?.status).toBe("ok");
  const meta = JSON.parse(conn!.meta) as { organization_id: string; channels: { platform: string; connected: boolean }[] };
  expect(meta.channels.map((c) => c.platform).sort()).toEqual(["instagram", "tiktok", "youtube"]);
  expect(meta.channels.every((c) => c.connected)).toBe(true);
  evidence("2-buffer", { screenshot: file, organization_id: meta.organization_id, channels: meta.channels.length });
});
