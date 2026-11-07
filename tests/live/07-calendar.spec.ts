// Checklist 7: the Calendar on staging: approve the synthetic "TEST POST" clips (item 5c), Fill
// the calendar (caps respected, nothing from a held video), move one, take one off. Nothing is
// posted: the Phase 0 real posts to the owner's test channels finished 7 Nov 2026 and those
// channels are gone; the hourly lane's Buffer load and read-back are proven by the unit suite
// on the Buffer fake.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { d1, evidence, shot } from "./helpers";

const TEST_CAPTION = "TEST POST · Phase 0 live test of Sheila Studio. Please ignore.";
const TZ = "America/New_York";
const CAPS: Record<string, number> = { tiktok: 10, instagram: 7, youtube: 5 };

function ev(): Record<string, Record<string, unknown>> {
  return JSON.parse(readFileSync("docs/design/live/evidence.json", "utf8"));
}
const synthDump = () => String(process.env.LIVE_TEST_DUMP_ID ?? ev()["5c-dump-synthetic"]?.dump_id ?? "");

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

test("7 · approve the TEST clips, Fill (caps respected), move one, take one off", async ({ page }) => {
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

  const offRows = tt ? d1<{ status: string }>(`SELECT status FROM posts WHERE id = '${tt.id}'`) : [];
  if (tt) expect(offRows[0]?.status, "taken off the calendar").toBe("unscheduled");
  evidence("7-calendar", { test_clip: testClip, filled_posts: planned.length, per_week: Object.fromEntries(perWeek), moved_post: moved, taken_off_post: tt?.id ?? null, fill_screenshot: fillShot, taken_off_screenshot: offShot });
});
