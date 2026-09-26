// Checklist 5: Dump + cut on staging for real, with a real talking-to-camera video the owner
// supplied (TikTok-style download, low resolution: the real "recycle an old post" case). The
// file comes from LIVE_DUMP_VIDEO (a copy, never the original). Dump → the `cut` job on
// GitHub Actions → clips back → "N clips ready" email in Resend → Review shows playable clips.
import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { d1, evidence, latestRun, shot, waitForEmail, waitForRow } from "./helpers";

const VIDEO = process.env.LIVE_DUMP_VIDEO ?? "";

test("5 · Dump a real video → cut on Actions → clips + 'clips ready' email → playable in Review", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  expect(VIDEO, "set LIVE_DUMP_VIDEO to a copy of a real video").not.toBe("");
  const sizeMb = Math.round(statSync(VIDEO).size / 1e6);

  await page.goto("/dump");
  await expect(page.getByRole("heading", { name: "Dump videos" })).toBeVisible();
  if (await page.getByRole("button", { name: "Start a new dump" }).isVisible()) await page.getByRole("button", { name: "Start a new dump" }).click();
  await page.getByRole("button", { name: /New raw footage/ }).click();
  await page.locator('input[type="file"]').setInputFiles(VIDEO);
  await expect(page.getByText("Uploaded")).toBeVisible({ timeout: 10 * 60_000 });
  await page.getByLabel("Notes for this dump").fill("Phase 0 live test: real talking-to-camera clip. TEST, not for posting to a real audience.");
  const since = Date.now();
  const dumpCall = page.waitForResponse((r) => /\/api\/dumps\/[^/]+\/dump$/.test(r.url()));
  await page.getByRole("button", { name: "Dump", exact: true }).click();
  const res = await dumpCall;
  expect(res.status(), await res.text()).toBe(200);
  const { jobId } = (await res.json()) as { jobId: string };
  await expect(page.getByText("Dumped. We’ll email you when the clips are ready to review.")).toBeVisible();
  await shot(page, "05-dump-sent");

  // Ceiling: the last real cut took 134 s for a ~60 s source; this source is ~4x longer, so
  // 1.5 x 134 s x 4 ≈ 14 min, plus the runner queue. Past it: cancel and investigate.
  const [job] = await waitForRow<{ status: string; run_id: string | null; safe_error: string | null; ref_id: string }>(
    `SELECT status, run_id, safe_error, ref_id FROM jobs WHERE id = '${jobId}'`,
    (r) => ["done", "failed"].includes(r[0]?.status ?? ""),
    16 * 60_000,
    20_000,
  );
  const run = latestRun("job-cut.yml", since);
  expect(job!.status, job!.safe_error ?? "").toBe("done");
  const clips = d1<{ id: string; hidden: number; media_token: string | null; start_s: number; end_s: number }>(`SELECT id, hidden, media_token, start_s, end_s FROM clips WHERE dump_id = '${job!.ref_id}'`);
  expect(clips.length, "the cut made clips").toBeGreaterThan(0);
  const visible = clips.filter((c) => !c.hidden).length;
  const mail = await waitForEmail(new RegExp(`^${visible} clips? ready to review`), since, 120_000);

  await page.goto("/review");
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  // Playable: the browser loads real frames from the clip's media URL.
  await expect.poll(async () => video.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    await v.play().catch(() => undefined);
    return v.readyState >= 2 && v.videoWidth > 0 ? `${v.videoWidth}x${v.videoHeight}` : "";
  }), { timeout: 60_000 }).toMatch(/^\d+x\d+$/);
  const dims = await video.evaluate((v: HTMLVideoElement) => ({ w: v.videoWidth, h: v.videoHeight, duration: v.duration }));
  const reviewShot = await shot(page, "05-review-clip");
  evidence("5-dump", { source_mb: sizeMb, dump_id: job!.ref_id, cut_job: jobId, run_id: run?.databaseId ?? job!.run_id, clips: clips.length, visible, clips_ready_email_id: mail.id, email_subject_count: visible, first_clip_video: dims, review_screenshot: reviewShot });
});
