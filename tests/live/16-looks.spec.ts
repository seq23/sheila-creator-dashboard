// Looks (#27) on staging, one real dump: the synthetic TEST video is cut into clips with varied
// Looks (at least one grid), and "Change look" in Review re-renders one clip on the runner.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { d1, evidence, shot, waitForRow } from "./helpers";

const dumpId = () => String(process.env.LIVE_DUMP_ID ?? (JSON.parse(readFileSync("docs/design/live/evidence.json", "utf8")) as Record<string, { dump_id?: string }>)["16-looks-dump"]?.dump_id ?? "");

test("16 · varied Looks incl. a grid; Change look re-renders one clip", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  const d = dumpId();
  expect(d, "run 05-dump with LIVE_DUMP_LABEL=16-looks-dump first").not.toBe("");
  const clips = d1<{ id: string; look: string | null; r2_key: string }>(`SELECT id, look, r2_key FROM clips WHERE dump_id = '${d}' ORDER BY score DESC`);
  const looks = [...new Set(clips.map((c) => c.look))];
  expect(clips.every((c) => !!c.look), "every clip records its Look").toBe(true);
  expect(looks.length, `varied Looks: ${looks.join(",")}`).toBeGreaterThanOrEqual(Math.min(3, clips.length));
  const grids = ["split", "side_by_side", "grid_four", "grid_six", "grid_eight", "hero_strip"];
  expect(clips.some((c) => grids.includes(c.look!)), `at least one grid among ${looks.join(",")}`).toBe(true);

  await page.goto("/review");
  const target = clips.find((c) => c.look !== "cinematic")!;
  const card = page.locator(`[data-clip-id="${target.id}"]`);
  await expect(card.locator(".look-chip")).toBeVisible();
  const gridShot = await shot(page, "16-looks-review");
  await card.getByRole("button", { name: "Change look" }).click();
  const dialog = page.getByRole("dialog", { name: "Change look" });
  await dialog.locator('[data-look-option="cinematic"]').click();
  await expect(card.locator(".look-pending")).toBeVisible();
  const [done] = await waitForRow<{ look: string; pending_look: string | null; r2_key: string; rerender_error: string | null }>(
    `SELECT look, pending_look, r2_key, rerender_error FROM clips WHERE id = '${target.id}'`,
    (r) => !r[0]?.pending_look,
    12 * 60_000,
    15_000,
  );
  expect(done!.rerender_error ?? null).toBeNull();
  expect(done!.look).toBe("cinematic");
  await page.reload();
  await expect(card.locator(".look-chip")).toContainText(/Cinematic/i);
  const video = card.locator("video");
  await expect.poll(async () => video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play().catch(() => undefined);
    return v.readyState >= 2 && v.videoWidth > 0;
  }), { timeout: 60_000 }).toBe(true);
  evidence("16-looks", { dump_id: d, clips: clips.length, looks, changed_clip: target.id, changed_from: target.look, file_changed: done!.r2_key !== target.r2_key, review_screenshot: gridShot, after_screenshot: await shot(page, "16-looks-changed") });
});
