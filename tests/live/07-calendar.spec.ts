// Checklist 7: Calendar + a REAL post through Buffer to the owner's throwaway channels
// (TikTok @iamcindymercer, Instagram seq23, YouTube "Sequoia Taylor"; she named every channel on
// that Buffer account a test channel, 25 Sep 2026). Only the synthetic "TEST POST" clip is ever
// posted (item 5c); another creator's footage is held off the calendar by the watermark check.
//
//   7a  approve the TEST clips, Fill the calendar (caps respected), move one, take one off, and
//       put the TEST clip on all three channels a few minutes after the next hourly run
//   7b  the hourly lane loads it into Buffer (SCHEDULED) and Buffer publishes it: post.status
//       "sent" with an externalLink, read back from Buffer's API
//   7c  the next hourly run reads it back: the dashboard shows it Posted with the link
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { d1, evidence, shot, vaultSecret, waitForRow } from "./helpers";

const TEST_CAPTION = "TEST POST · Phase 0 live test of Sheila Studio. Please ignore.";
const TZ = "America/New_York";
const CAPS: Record<string, number> = { tiktok: 10, instagram: 7, youtube: 5 };

function ev(): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync("docs/design/live/evidence.json", "utf8"));
}
const synthDump = () => String(process.env.LIVE_TEST_DUMP_ID ?? ev()["5c-dump-synthetic"]?.dump_id ?? "");

async function buffer<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.buffer.com/", { method: "POST", headers: { Authorization: `Bearer ${vaultSecret("buffer-access-token")}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || body.errors?.length) throw new Error(`Buffer: ${res.status} ${body.errors?.[0]?.message ?? ""}`);
  return body.data as T;
}

/** "YYYY-MM-DD" and "HH:MM" in the audience time zone. */
function local(d: Date): { day: string; time: string } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { day, time };
}
function weekKey(iso: string): string {
  const d = new Date(iso);
  const { day } = local(d);
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sun
  const monday = new Date(`${day}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((wd + 6) % 7));
  return monday.toISOString().slice(0, 10);
}
/** The calendar has drawn its week (a race here once walked five weeks past a visible post). */
async function calendarReady(page: Page) {
  await expect(page.locator("section.cal-day").first()).toBeVisible();
  await expect(page.locator(".cal-caps")).toBeVisible();
}
async function findPost(page: Page, postId: string) {
  await calendarReady(page);
  for (let i = 0; i < 6 && !(await page.locator(`[data-post="${postId}"]`).isVisible()); i++) {
    await page.getByRole("button", { name: "Next week" }).click();
    await calendarReady(page);
  }
  await expect(page.locator(`[data-post="${postId}"]`)).toBeVisible();
}
async function openPost(page: Page, postId: string) {
  await page.locator(`[data-post="${postId}"] .cal-post-main`).click();
}

test.describe.configure({ mode: "serial" });

test("7a · approve the TEST clip, Fill (caps respected), move one, take one off, set the TEST post minutes out", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const dump = synthDump();
  expect(dump, "run 05-dump with the synthetic TEST clip first (LIVE_DUMP_LABEL=5c-dump-synthetic)").not.toBe("");
  const clips = d1<{ id: string; status: string }>(`SELECT id, status FROM clips WHERE dump_id = '${dump}' AND hidden = 0 ORDER BY score DESC`);
  expect(clips.length).toBeGreaterThan(0);
  const testClip = clips[0]!.id;

  // Review: every TEST clip gets the TEST caption and is approved.
  await page.goto("/review");
  for (const c of clips.filter((x) => x.status === "draft")) {
    const card = page.locator(`[data-clip-id="${c.id}"]`);
    await card.getByRole("button", { name: "Edit caption & hook" }).click();
    await page.getByRole("dialog").getByLabel("Caption", { exact: true }).fill(TEST_CAPTION);
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".toast").filter({ hasText: "Saved" }).first()).toBeVisible();
    await card.getByRole("button", { name: "Approve" }).click();
    await expect(card).toHaveCount(0);
  }

  // Calendar: Fill.
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Fill the calendar" }).click();
  await expect(page.locator(".toast").filter({ hasText: /Added \d+ posts? to the calendar|already full/ }).first()).toBeVisible();
  const planned = d1<{ id: string; clip_id: string; platform: string; scheduled_at: string; status: string }>("SELECT id, clip_id, platform, scheduled_at, status FROM posts WHERE status IN ('planned','in_buffer','posted')");
  expect(planned.length, "Fill put posts on the calendar").toBeGreaterThan(0);
  // Only postable clips: nothing from a held (someone else's) video.
  const held = d1<{ n: number }>("SELECT COUNT(*) AS n FROM posts p JOIN clips c ON c.id = p.clip_id JOIN assets a ON a.id = c.asset_id WHERE p.status IN ('planned','in_buffer') AND a.source_owner = 'other'");
  expect(held[0]!.n).toBe(0);
  // Caps: never more than her weekly number (10 / 7 / 5) per channel per week.
  const perWeek = new Map<string, number>();
  for (const p of planned) perWeek.set(`${p.platform} ${weekKey(p.scheduled_at)}`, (perWeek.get(`${p.platform} ${weekKey(p.scheduled_at)}`) ?? 0) + 1);
  for (const [k, n] of perWeek) expect(n, k).toBeLessThanOrEqual(CAPS[k.split(" ")[0]!]!);
  const fillShot = await shot(page, "07-calendar-filled");

  // Move one (not the TEST clip) to the next day with the picker.
  const other = planned.find((p) => p.clip_id !== testClip && p.status === "planned");
  let moved: string | null = null;
  if (other) {
    await page.goto("/calendar");
    await findPost(page, other.id);
    await openPost(page, other.id);
    const select = page.getByLabel("Move to…");
    const options = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    const from = local(new Date(other.scheduled_at)).day;
    const target = options.find((o) => o > from) ?? options.find((o) => o !== from)!;
    await select.selectOption(target);
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await expect(page.locator(".toast").filter({ hasText: "Moved to" }).first()).toBeVisible();
    moved = other.id;
  }

  // Take the TEST clip's TikTok post off (it comes back through "Add" at the chosen minute).
  const testPosts = planned.filter((p) => p.clip_id === testClip);
  await page.goto("/calendar");
  const tt = testPosts.find((p) => p.platform === "tiktok");
  if (tt) {
    await findPost(page, tt.id);
    await openPost(page, tt.id);
    await page.getByRole("button", { name: "Take off the calendar" }).click();
    await expect(page.locator(".toast").filter({ hasText: "Taken off" }).first()).toBeVisible();
  }
  const offShot = await shot(page, "07-calendar-taken-off");

  // The TEST post: ten minutes after the next hourly run, so that run loads it into Buffer.
  const nextHour = new Date(Math.ceil(Date.now() / 3600_000) * 3600_000);
  const at = new Date(nextHour.getTime() + 10 * 60_000);
  const { day, time } = local(at);
  // The screen moves a post by day and adds a pool clip at a chosen time; the TEST clip is not in
  // the pool while its other posts are planned, so the exact minute goes through the same routes
  // the screen uses (PATCH a planned post, POST a new one), as setup.
  for (const platform of ["tiktok", "instagram", "youtube"]) {
    const p = testPosts.find((x) => x.platform === platform && x.status === "planned" && x.id !== tt?.id);
    const r = p
      ? await page.request.patch(`/api/posts/${p.id}`, { data: { scheduled_at: at.toISOString() } })
      : await page.request.post("/api/posts", { data: { clip_id: testClip, platform, scheduled_at: at.toISOString() } });
    expect(r.ok(), `${platform}: ${await r.text()}`).toBe(true);
  }
  void day;
  void time;
  const mine = d1<{ id: string; platform: string; scheduled_at: string; status: string }>(`SELECT id, platform, scheduled_at, status FROM posts WHERE clip_id = '${testClip}' AND status IN ('planned','in_buffer')`);
  expect(mine.map((p) => p.platform).sort()).toEqual(["instagram", "tiktok", "youtube"]);
  for (const p of mine) expect(p.scheduled_at).toBe(at.toISOString());
  evidence("7-calendar", { test_clip: testClip, test_posts: mine.map((p) => p.id), post_at_utc: at.toISOString(), filled_posts: planned.length, per_week: Object.fromEntries(perWeek), moved_post: moved, taken_off_post: tt?.id ?? null, fill_screenshot: fillShot, taken_off_screenshot: offShot });
});

test("7b · the hourly lane loads the TEST post into Buffer and Buffer publishes it", async () => {
  test.setTimeout(80 * 60_000);
  const e = ev()["7-calendar"]!;
  const ids = e.test_posts as string[];
  const due = Date.parse(String(e.post_at_utc));
  // Loaded by the hourly run before `due` (bounded: the run at due-10 min, plus 10 min slack).
  const rows = await waitForRow<{ id: string; platform: string; status: string; buffer_post_id: string | null; error: string | null }>(
    `SELECT id, platform, status, buffer_post_id, error FROM posts WHERE id IN ('${ids.join("','")}')`,
    (r) => r.every((p) => p.status !== "planned" || !!p.error),
    Math.max(60_000, due - Date.now() + 10 * 60_000),
    30_000,
  );
  const results: Record<string, unknown> = {};
  for (const p of rows) {
    if (!p.buffer_post_id) {
      results[p.platform] = { status: p.status, error: p.error };
      continue;
    }
    // Buffer publishes at `due`; allow 20 minutes for the platform to accept it.
    const deadline = Math.max(due, Date.now()) + 20 * 60_000;
    let last: { status: string; externalLink: string | null; error: unknown } | null = null;
    while (Date.now() < deadline) {
      const d = await buffer<{ post: { status: string; externalLink: string | null; error: unknown } | null }>(
        "query($id: PostId!) { post(input: { id: $id }) { status externalLink error } }",
        { id: p.buffer_post_id },
      );
      last = d.post;
      if (last && ["sent", "error"].includes(last.status.toLowerCase())) break;
      await new Promise((r) => setTimeout(r, 60_000));
    }
    results[p.platform] = { buffer_post_id: p.buffer_post_id, status: last?.status ?? null, externalLink: last?.externalLink ?? null, error: last?.error ? JSON.stringify(last.error).slice(0, 300) : null };
  }
  evidence("7-calendar", { buffer_readback: results });
  for (const [platform, r] of Object.entries(results) as [string, { status: string | null }][]) expect(r.status?.toLowerCase(), `${platform}: ${JSON.stringify(r)}`).toBe("sent");
});

test("7c · the next hourly run reads it back: Posted with the link on the Calendar", async ({ page }) => {
  test.setTimeout(80 * 60_000);
  const e = ev()["7-calendar"]!;
  const ids = e.test_posts as string[];
  const nextRun = Math.ceil(Date.now() / 3600_000) * 3600_000;
  const rows = await waitForRow<{ platform: string; status: string; url: string | null; error: string | null }>(
    `SELECT platform, status, url, error FROM posts WHERE id IN ('${ids.join("','")}')`,
    (r) => r.every((p) => p.status === "posted" || p.status === "failed"),
    nextRun - Date.now() + 10 * 60_000,
    30_000,
  );
  for (const r of rows) expect(r, JSON.stringify(r)).toMatchObject({ status: "posted", url: expect.stringMatching(/^https:\/\//) });
  await page.goto("/calendar");
  await expect(page.locator(".cal-post.posted").first()).toBeVisible();
  evidence("7-calendar", { dashboard_posted: rows, posted_screenshot: await shot(page, "07-calendar-posted") });
});
