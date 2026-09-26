// Checklist 6: Review on the clips the live cut made (item 5's dump). Approve some, reject one
// with a reason, edit a caption, swap the hook, untick a platform, and a paid partnership adds
// #ad exactly once however many times it is saved. The captions say TEST: these clips are
// posted for real to the owner's throwaway channels in item 7.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { d1, evidence, shot } from "./helpers";

const TEST_CAPTION = "TEST POST · Phase 0 live test of Sheila Studio. Please ignore.";

function dumpId(): string {
  const ev = JSON.parse(readFileSync("docs/design/live/evidence.json", "utf8")) as Record<string, { dump_id?: string }>;
  const id = process.env.LIVE_DUMP_ID ?? ev["5-dump"]?.dump_id;
  if (!id) throw new Error("run 05-dump first (or set LIVE_DUMP_ID)");
  return id;
}
type ClipRow = { id: string; hook_text: string; hook_alt: string | null; caption: string; platforms: string; status: string; paid_partnership: number; reject_reason: string | null };
const clips = (d: string) => d1<ClipRow>(`SELECT id, hook_text, hook_alt, caption, platforms, status, paid_partnership, reject_reason FROM clips WHERE dump_id = '${d}' AND hidden = 0 ORDER BY score DESC`);
const card = (page: Page, id: string) => page.locator(`[data-clip-id="${id}"]`);

async function editCaption(page: Page, id: string, fill: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>) {
  await card(page, id).getByRole("button", { name: "Edit caption & hook" }).click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toast").filter({ hasText: "Saved" }).first()).toBeVisible();
}

test("6 · approve, reject with a reason, edit caption, swap hook, untick a platform, #ad once", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  const d = dumpId();
  const drafts = clips(d).filter((c) => c.status === "draft");
  expect(drafts.length, "enough fresh clips from the live cut").toBeGreaterThanOrEqual(5);
  const [a, b, c, r] = [drafts[0]!, drafts[1]!, drafts[2]!, drafts[drafts.length - 1]!];
  await page.goto("/review");
  await expect(card(page, a.id)).toBeVisible();

  // A: her own caption + the other hook, then approve (posted in item 7 to all three channels).
  await editCaption(page, a.id, async (dialog) => {
    await dialog.getByLabel("Caption", { exact: true }).fill(TEST_CAPTION);
    if (a.hook_alt) {
      await dialog.getByRole("button", { name: /Use the other hook/ }).click();
      await expect(dialog.getByLabel("On-screen hook")).toHaveValue(a.hook_alt);
    }
  });
  await expect(card(page, a.id)).toContainText(TEST_CAPTION);
  await card(page, a.id).getByRole("button", { name: "Approve" }).click();
  await expect(page.locator(".toast").filter({ hasText: "Approved" }).first()).toBeVisible();

  // B: untick YouTube on the card (one tap), test caption, approve.
  await editCaption(page, b.id, async (dialog) => dialog.getByLabel("Caption", { exact: true }).fill(TEST_CAPTION));
  await card(page, b.id).getByRole("button", { name: "Post to YouTube" }).click();
  await expect(card(page, b.id).getByRole("button", { name: "Post to YouTube" })).toHaveAttribute("aria-pressed", "false");
  await card(page, b.id).getByRole("button", { name: "Approve" }).click();
  await expect(card(page, b.id)).toHaveCount(0);

  // C: paid partnership, saved twice: "#ad" appears once.
  await editCaption(page, c.id, async (dialog) => {
    await dialog.getByLabel("Caption", { exact: true }).fill(TEST_CAPTION);
    await dialog.getByText("Paid partnership", { exact: true }).click();
  });
  await editCaption(page, c.id, async () => undefined);
  await expect(card(page, c.id).locator(".pill", { hasText: "Paid partnership" })).toBeVisible();
  const editedShot = await shot(page, "06-review-edited");
  await card(page, c.id).getByRole("button", { name: "Approve" }).click();
  await expect(card(page, c.id)).toHaveCount(0);

  // R: reject with a reason.
  await card(page, r.id).getByRole("button", { name: "Reject" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bad hook" }).click();
  await expect(card(page, r.id)).toHaveCount(0);
  await page.getByRole("tab", { name: /Rejected/ }).click();
  await expect(card(page, r.id)).toContainText("Reason: bad hook");
  const rejectedShot = await shot(page, "06-review-rejected");

  const after = Object.fromEntries(clips(d).map((x) => [x.id, x]));
  expect(after[a.id]).toMatchObject({ status: "approved", caption: TEST_CAPTION, ...(a.hook_alt ? { hook_text: a.hook_alt, hook_alt: a.hook_text } : {}) });
  expect(after[b.id]!.status).toBe("approved");
  expect(JSON.parse(after[b.id]!.platforms)).toEqual(["tiktok", "instagram"]);
  expect(after[c.id]!.status).toBe("approved");
  expect(after[c.id]!.paid_partnership).toBe(1);
  expect(after[c.id]!.caption.match(/#ad\b/g), "#ad exactly once after two saves").toHaveLength(1);
  expect(after[r.id]).toMatchObject({ status: "rejected", reject_reason: "bad hook" });
  evidence("6-review", { approved: [a.id, b.id, c.id], rejected: r.id, hook_swapped: !!a.hook_alt, edited_screenshot: editedShot, rejected_screenshot: rejectedShot });
});
