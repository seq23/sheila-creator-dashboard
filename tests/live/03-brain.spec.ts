// Checklist 3: Client Brain on staging for real, plus the AI connection it needs (checklist 4's
// first step: the draft profile is written by the AI, so OpenRouter is connected here first).
// A real 2-page brand-guide PDF (text layer) and a scanned-style page (image only, no text
// layer) go up through the screen; the `extract` job runs on GitHub Actions and reads both (the
// second through OCR); the draft profile is written from them and locked.
import path from "node:path";
import { expect, test } from "@playwright/test";
import { d1, evidence, latestRun, shot, vaultSecret, waitForRow } from "./helpers";

test.describe.configure({ mode: "serial" });

const PDF = path.join("tests", "live", "fixtures", "golden-table-brand-guide.pdf");
const SCAN = path.join("tests", "live", "fixtures", "golden-table-scanned-page.pdf");

test("4a · connect the AI (OpenRouter) on Connect with the owner's key", async ({ page }) => {
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "OpenRouter", exact: true }) });
  await expect(card.getByRole("button", { name: /^(Check again|Check key)$/ })).toBeVisible();
  if (await card.getByRole("button", { name: "Check again" }).isVisible()) {
    await card.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByText("Still working.")).toBeVisible({ timeout: 30_000 });
  } else {
    await card.getByLabel("AI · OpenRouter key").fill(vaultSecret("openrouter-ai-c4dc6108"));
    await card.getByRole("button", { name: "Check key" }).click();
    await expect(page.getByText("OpenRouter connected.")).toBeVisible({ timeout: 30_000 });
  }
  await expect(card).toContainText("Connected");
  const file = await shot(page, "04-openrouter-connected");
  expect(d1<{ status: string }>("SELECT status FROM connections WHERE service = 'openrouter'")[0]?.status).toBe("ok");
  evidence("4-research", { openrouter_screenshot: file });
});

test("3 · upload a brand PDF and a scanned page → extract on Actions → OCR → draft → lock", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto("/brain");
  await expect(page.getByRole("heading", { name: "Client Brain" })).toBeVisible();
  await expect(page.getByText(/Start with your brand docs|Drop more brand docs/)).toBeVisible();
  if (await page.getByRole("button", { name: "Unlock to edit" }).isVisible()) {
    await page.getByRole("button", { name: "Unlock to edit" }).click();
    await expect(page.locator(".pill", { hasText: "Not locked" })).toBeVisible();
  }

  const since = Date.now();
  const extractCall = page.waitForResponse((r) => r.url().endsWith("/api/brain/extract") && r.request().method() === "POST");
  await page.getByLabel("Choose brand docs").setInputFiles([PDF, SCAN]);
  const extract = (await (await extractCall).json()) as { jobId: string | null; docs: number };
  expect(extract.docs, "both files went to the reader").toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel("Brand docs").getByText("Reading text…").first()).toBeVisible();

  // The job on Actions. Ceiling: 1.5× the last extract run (41 s on 25 Sep) plus the runner's
  // queue wait; past it the run is cancelled and investigated, never watched.
  const rows = await waitForRow<{ status: string; run_id: string | null; safe_error: string | null }>(
    `SELECT status, run_id, safe_error FROM jobs WHERE id = '${extract.jobId}'`,
    (r) => ["done", "failed"].includes(r[0]?.status ?? ""),
    6 * 60_000,
    10_000,
  );
  const run = latestRun("job-extract.yml", since);
  expect(rows[0]!.status, rows[0]!.safe_error ?? "").toBe("done");

  await page.reload();
  const docs = d1<{ file_name: string; extract_status: string; char_count: number }>("SELECT file_name, extract_status, char_count FROM brand_docs WHERE file_name LIKE 'golden-table-%'");
  const pdf = docs.find((d) => d.file_name === "golden-table-brand-guide.pdf");
  const scan = docs.find((d) => d.file_name === "golden-table-scanned-page.pdf");
  expect(pdf?.extract_status).toBe("done");
  expect(pdf!.char_count, "the text-layer PDF was read").toBeGreaterThan(1500);
  expect(scan?.extract_status, "the image-only page was read by OCR").toBe("done");
  expect(scan!.char_count, "OCR found the page's words").toBeGreaterThan(600);
  await expect(page.getByLabel("Brand docs").getByText(/^Read · \d+ words$/)).toHaveCount(docs.length);
  const docsShot = await shot(page, "03-brain-docs-read");

  await page.getByRole("button", { name: /Draft my profile|Redraft profile from all docs/ }).click();
  await expect(page.locator(".toast").filter({ hasText: "New draft ready." })).toBeVisible({ timeout: 90_000 });
  // The draft is written from THESE docs: her studio, her city, her offers.
  await expect(page.getByLabel("Who she is")).toHaveValue(/Golden Table|Maren|tablescape/i);
  await page.getByRole("button", { name: "Lock profile" }).click();
  await expect(page.locator(".pill", { hasText: "Locked" })).toBeVisible();
  const lockShot = await shot(page, "03-brain-profile-locked", { fullPage: true });
  evidence("3-brain", { extract_job: extract.jobId, run_id: run?.databaseId ?? rows[0]!.run_id, pdf_chars: pdf!.char_count, ocr_chars: scan!.char_count, docs_screenshot: docsShot, locked_screenshot: lockShot });
});
