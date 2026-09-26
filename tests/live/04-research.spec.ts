// Checklist 4: Research Brief on staging for real. OpenRouter is connected (03-brain 4a),
// Firecrawl is NOT: the brief must say web search was skipped, not fail. Refresh → the
// `research` job on Actions → a brief whose every claim carries a label (web / her data /
// upload / uncertain), nothing labelled as fact without a source → Approve.
import { expect, test } from "@playwright/test";
import { d1, evidence, latestRun, shot, waitForRow } from "./helpers";

test("4 · Refresh research → research job on Actions → labelled brief, web search off → approve", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  expect(d1<{ n: number }>("SELECT COUNT(*) AS n FROM connections WHERE service = 'firecrawl' AND status = 'ok'")[0]?.n, "Firecrawl stays unconnected for this item").toBe(0);
  await page.goto("/research");
  const since = Date.now();
  const refreshCall = page.waitForResponse((r) => r.url().endsWith("/api/research/refresh"));
  await page.getByRole("button", { name: "Refresh research" }).click();
  const res = await refreshCall;
  expect(res.status(), await res.text()).toBe(200);
  const { jobId } = (await res.json()) as { jobId: string };
  await expect(page.getByText("Researching…").first()).toBeVisible();

  // No earlier research run to take 1.5x of; the screen promises 5 to 10 minutes, so the
  // ceiling is 1.5x its upper bound (15 min). Past it the run is cancelled and investigated.
  const [job] = await waitForRow<{ status: string; run_id: string | null; safe_error: string | null }>(
    `SELECT status, run_id, safe_error FROM jobs WHERE id = '${jobId}'`,
    (r) => ["done", "failed"].includes(r[0]?.status ?? ""),
    15 * 60_000,
    20_000,
  );
  const run = latestRun("job-research.yml", since);
  expect(job!.status, job!.safe_error ?? "").toBe("done");

  await page.reload();
  await expect(page.getByText(/^Draft v\d+/)).toBeVisible();
  await expect(page.getByText("Web search was skipped because Firecrawl isn’t connected")).toBeVisible();
  const claims = page.locator(".rs-claim");
  expect(await claims.count(), "the brief has claims").toBeGreaterThan(3);
  const labels = await claims.evaluateAll((els) => els.map((e) => e.getAttribute("data-label")));
  expect(labels.every((l) => ["web", "her_data", "upload", "uncertain"].includes(String(l))), `labels: ${[...new Set(labels)].join(",")}`).toBe(true);
  // Web search was off, so any "web" claim comes from the built-in posting studies and must link one.
  const webClaims = page.locator('.rs-claim[data-label="web"]');
  for (let i = 0; i < (await webClaims.count()); i++) await expect(webClaims.nth(i).locator('a[href^="http"]').first()).toBeVisible();
  const factsWithoutSource = await page.locator('.rs-claim:not([data-label="uncertain"])').filter({ hasText: "No source yet" }).count();
  expect(factsWithoutSource, "truth rule: nothing labelled as fact lacks a source").toBe(0);
  const draftShot = await shot(page, "04-research-draft", { fullPage: true });

  await page.getByRole("button", { name: "Approve brief" }).click();
  await expect(page.locator(".toast").filter({ hasText: "Approved" })).toBeVisible();
  await expect(page.getByText(/^Approved v\d+/)).toBeVisible();
  const [brief] = d1<{ version: number; status: string }>("SELECT version, status FROM research_briefs ORDER BY version DESC LIMIT 1");
  expect(brief?.status).toBe("approved");
  evidence("4-research", { research_job: jobId, run_id: run?.databaseId ?? job!.run_id, claims: labels.length, label_counts: Object.fromEntries([...new Set(labels)].map((l) => [l, labels.filter((x) => x === l).length])), brief_version: brief!.version, draft_screenshot: draftShot, approved_screenshot: await shot(page, "04-research-approved") });
});
