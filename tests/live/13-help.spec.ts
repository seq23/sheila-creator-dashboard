// Checklist 13: Help on staging: search, a guide step by step, "Did this work?" feedback, the tour.
import { expect, test } from "@playwright/test";
import { d1, evidence, shot } from "./helpers";

test("13 · help search, a guide, feedback stored, tour replays", async ({ page }) => {
  await page.goto("/help");
  await page.getByPlaceholder("What do you need help with?").fill("buffer");
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.locator(`a[href="/help/connect-buffer"]`)).toBeVisible();
  const searchShot = await shot(page, "13-help-search");

  await page.goto("/help/someone-elses-video");
  await expect(page.getByRole("heading", { name: "Looks like someone else's video", level: 1 })).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  for (let i = 2; i <= 4; i++) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(`Step ${i} of 4`)).toBeVisible();
  }
  const before = d1<{ n: number }>("SELECT COUNT(*) AS n FROM help_feedback")[0]!.n;
  const [fb] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/help/feedback")), page.getByRole("button", { name: "Yes", exact: true }).click()]);
  expect(fb.status()).toBe(200);
  await expect(page.getByText("Great. You can close this guide.")).toBeVisible();
  expect(d1<{ n: number }>("SELECT COUNT(*) AS n FROM help_feedback")[0]!.n).toBe(before + 1);
  const guideShot = await shot(page, "13-help-guide");

  await page.goto("/help");
  await page.getByRole("button", { name: "Replay the tour" }).click();
  const tour = page.getByRole("dialog", { name: "Quick tour" });
  await expect(tour).toBeVisible();
  const stops = ["Dump", "Review", "Calendar", "Deals", "Help"];
  for (const [i, s] of stops.entries()) {
    await expect(tour.getByRole("heading", { name: s })).toBeVisible();
    await tour.getByRole("button", { name: i === stops.length - 1 ? "Done" : "Next" }).click();
  }
  await expect(tour).toHaveCount(0);
  evidence("13-help", { search_screenshot: searchShot, guide_screenshot: guideShot, feedback_rows_added: 1, tour_stops: stops.length });
});
