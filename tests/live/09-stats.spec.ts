// Checklist 9: Stats on staging for real. YouTube stats are connected with Google sign-in (the
// owner clicked Allow on 25 Sep 2026); Sync now runs the `metrics` job on Actions and real
// numbers land. TikTok: the real TikTok Studio "Content" export of @iamcindymercer (the CSV
// from the ZIP TikTok hands over) is uploaded on Stats and read. Instagram sign-in is not tested
// (owner decision: being replaced).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { d1, evidence, latestRun, shot, waitForRow } from "./helpers";

const CSV = process.env.LIVE_TIKTOK_CSV ?? "";

test("9a · YouTube: Sync now → metrics job on Actions → real channel numbers", async ({ page }) => {
  test.setTimeout(25 * 60_000);
  expect(d1<{ status: string }>("SELECT status FROM connections WHERE service = 'google'")[0]?.status).toBe("ok");
  await page.goto("/stats");
  const since = Date.now();
  const call = page.waitForResponse((r) => r.url().endsWith("/api/stats/sync"));
  await page.getByRole("button", { name: "Update numbers" }).click();
  const res = await call;
  expect(res.status(), await res.text()).toBe(200);
  const { jobId } = (await res.json()) as { jobId: string };
  const [job] = await waitForRow<{ status: string; safe_error: string | null; run_id: string | null }>(`SELECT status, safe_error, run_id FROM jobs WHERE id = '${jobId}'`, (r) => ["done", "failed"].includes(r[0]?.status ?? ""), 20 * 60_000, 20_000);
  const run = latestRun("job-metrics.yml", since);
  expect(job!.status, job!.safe_error ?? "").toBe("done");
  const acct = d1<{ followers: number; avg_views: number; captured_at: string; source: string }>("SELECT followers, avg_views, captured_at, source FROM account_stats WHERE platform = 'youtube' ORDER BY captured_at DESC LIMIT 1");
  expect(acct[0]?.source).toBe("api");
  expect(Date.parse(acct[0]!.captured_at)).toBeGreaterThan(since - 60_000);
  const vids = d1<{ n: number; views: number }>("SELECT COUNT(*) AS n, COALESCE(SUM(views), 0) AS views FROM platform_videos WHERE platform = 'youtube'")[0]!;
  const [light] = d1<{ light: string; note: string }>("SELECT light, note FROM health WHERE name = 'YouTube stats'");
  await page.reload();
  evidence("9-stats", { youtube_job: jobId, run_id: run?.databaseId ?? job!.run_id, youtube_subscribers: acct[0]!.followers, youtube_avg_views: acct[0]!.avg_views, youtube_videos: vids.n, youtube_total_views: vids.views, youtube_light: light ?? null, youtube_screenshot: await shot(page, "09-stats-youtube", { fullPage: true }) });
});

test("9b · TikTok: the real TikTok Studio export is read on Stats", async ({ page }) => {
  expect(CSV, "set LIVE_TIKTOK_CSV to the Content.csv from TikTok Studio").not.toBe("");
  await page.goto("/stats");
  const call = page.waitForResponse((r) => r.url().endsWith("/api/stats/tiktok-import"));
  await page.getByLabel("Choose your TikTok export").setInputFiles(CSV);
  const res = await call;
  const body = (await res.json()) as { ok?: boolean; kind?: string; videos?: number; skipped?: number; error?: string };
  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.kind).toBe("content");
  const dataRows = readFileSync(CSV, "utf8").split(/\r?\n/).filter((l) => l.includes("tiktok.com/")).length;
  expect(dataRows).toBeGreaterThan(0);
  expect(body.videos, "every video row in the real export was read").toBe(dataRows);
  expect(body.skipped).toBe(0);
  await expect(page.locator(".toast").filter({ hasText: `Imported ${dataRows} TikTok video` }).first()).toBeVisible();
  const rows = d1<{ url: string; posted_at: string | null; views: number }>("SELECT url, posted_at, views FROM platform_videos WHERE platform = 'tiktok' AND source = 'import' ORDER BY views DESC");
  expect(rows.length).toBeGreaterThanOrEqual(dataRows);
  for (const r of rows) {
    expect(r.url).toMatch(/^https:\/\/www\.tiktok\.com\/@iamcindymercer\/video\/\d+$/);
    expect(r.posted_at, "a post date without a year still lands in the past year").toMatch(/^2026-/);
  }
  const [light] = d1<{ light: string; note: string }>("SELECT light, note FROM health WHERE name = 'TikTok stats'");
  expect(light?.light).toBe("green");
  evidence("9-stats", { tiktok_videos: rows.length, tiktok_views: rows.map((r) => r.views), tiktok_posted_at: rows.map((r) => r.posted_at), tiktok_light: light, tiktok_screenshot: await shot(page, "09-stats-tiktok", { fullPage: true }) });
});
