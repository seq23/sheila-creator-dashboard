// Checklist 10: Deals on staging for real (#32 design). The brand finder runs on Actions with
// Firecrawl connected, then with Firecrawl disconnected (the keyless free search), and ranks by
// expected money. A pitch is written by the real model, opened as a Gmail compose link and
// marked sent by hand; a follow-up comes due; a brand's offer is read; the deal memo holds the
// agreed terms. Nothing is ever sent to a brand: the only emails that leave go to the owner.
import { expect, test, type Page } from "@playwright/test";
import { OWNER, d1, emailsSince, evidence, latestRun, shot, vaultSecret, waitForRow } from "./helpers";

test.describe.configure({ mode: "serial" });
const START = Date.now();

async function runFinder(page: Page, label: string) {
  await page.goto("/deals");
  const since = Date.now();
  const call = page.waitForResponse((r) => r.url().endsWith("/api/deals/finder/run"));
  await page.getByRole("button", { name: "Find brands now" }).click();
  const res = await call;
  expect(res.status(), await res.text()).toBe(200);
  const { jobId } = (await res.json()) as { jobId: string };
  // Ceiling: 1.5 x the slowest recent finder run (7 min on 26 Sep) = ~11 min.
  const [job] = await waitForRow<{ status: string; safe_error: string | null; run_id: string | null }>(`SELECT status, safe_error, run_id FROM jobs WHERE id = '${jobId}'`, (r) => ["done", "failed"].includes(r[0]?.status ?? ""), 11 * 60_000, 20_000);
  expect(job!.status, job!.safe_error ?? "").toBe("done");
  const [light] = d1<{ light: string; note: string }>("SELECT light, note FROM health WHERE name = 'Brand finder'");
  await page.reload();
  const region = page.getByRole("region", { name: "Brands to pitch this week" });
  const cards = region.locator("article");
  await expect(cards.first().or(region.getByRole("heading", { name: "No brands yet" }))).toBeVisible(); // loaded
  const n = await cards.count();
  // ranked by expected money: the "How it ranked" totals never go up down the list
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const text = (await cards.nth(i).locator("details").textContent()) ?? "";
    const m = text.match(/=\s*([0-9.]+)\s*$/m) ?? text.match(/=\s*([0-9.]+)/);
    if (m) scores.push(Number(m[1]));
  }
  for (let i = 1; i < scores.length; i++) expect(scores[i]!, `card ${i} ranks below card ${i - 1}`).toBeLessThanOrEqual(scores[i - 1]! + 1e-9);
  const brands = d1<{ n: number; paying: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN json_extract(budget_signal, '$.level') IN ('paying','likely') THEN 1 ELSE 0 END) AS paying FROM brands WHERE status = 'suggested'")[0]!;
  evidence("10-deals", { [`finder_${label}`]: { job: jobId, run_id: latestRun("job-brand_finder.yml", since)?.databaseId ?? job!.run_id, light, cards_above_line: n, scores, brands_suggested: brands.n, brands_paying_or_likely: brands.paying }, [`finder_${label}_screenshot`]: await shot(page, `10-deals-finder-${label}`, { fullPage: true }) });
  return { n, light };
}

test("10a · brand finder with Firecrawl connected: ranked by money", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Firecrawl", exact: true }) });
  await expect(card.getByRole("button", { name: /^(Check again|Check key)$/ })).toBeVisible();
  if (await card.getByLabel("Web research · Firecrawl key").isVisible()) {
    await card.getByLabel("Web research · Firecrawl key").fill(vaultSecret("seq-firecrawl-api-key"));
    await card.getByRole("button", { name: "Check key" }).click();
    await expect(page.getByText("Firecrawl connected.")).toBeVisible({ timeout: 30_000 });
  }
  expect(d1<{ status: string }>("SELECT status FROM connections WHERE service = 'firecrawl'")[0]?.status).toBe("ok");
  const r = await runFinder(page, "firecrawl");
  expect(r.n, "brands above the line").toBeGreaterThan(0);
});

test("10b · brand finder with NO Firecrawl (keyless free search) still finds brands, then Firecrawl is put back", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.goto("/settings/connections");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Firecrawl", exact: true }) });
  await expect(card.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await card.getByRole("button", { name: "Disconnect" }).click();
  await expect(card.getByLabel("Web research · Firecrawl key")).toBeVisible();
  try {
    const r = await runFinder(page, "keyless");
    expect(r.light?.light, JSON.stringify(r.light)).not.toBe("red");
    expect(r.n + d1<{ n: number }>("SELECT COUNT(*) AS n FROM brands WHERE status = 'suggested'")[0]!.n).toBeGreaterThan(0);
  } finally {
    await page.goto("/settings/connections");
    await card.getByLabel("Web research · Firecrawl key").fill(vaultSecret("seq-firecrawl-api-key"));
    await card.getByRole("button", { name: "Check key" }).click();
    await expect(page.getByText("Firecrawl connected.")).toBeVisible({ timeout: 30_000 });
  }
});

test("10c · pitch with the real model → Gmail link → marked sent by hand → follow-up due on Home", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/deals");
  const region = page.getByRole("region", { name: "Brands to pitch this week" });
  const withContact = region.locator("article").filter({ hasText: /Contact: (?!none)/ }).first();
  await expect(withContact).toBeVisible();
  const brand = (await withContact.getByRole("heading").first().textContent())!.trim();
  await withContact.getByRole("button", { name: /^Pitch/ }).click();
  await expect(page.getByRole("heading", { name: brand, level: 2 })).toBeVisible({ timeout: 120_000 });
  const panel = page.getByRole("region", { name: "Write the email" }).or(page.locator('section[aria-label="Write the email"]'));
  const body = page.locator("textarea.email-body");
  if (!(await body.inputValue().catch(() => ""))) await panel.getByRole("button", { name: /Write it|Rewrite/ }).click();
  await expect(body).not.toHaveValue("", { timeout: 120_000 });
  const text = await body.inputValue();
  expect(text).not.toMatch(/fake model/i);
  const subject = await page.getByLabel("Subject", { exact: true }).inputValue();
  expect(subject.length).toBeGreaterThan(5);
  const gmail = page.getByRole("link", { name: "Open in Gmail" });
  const href = (await gmail.getAttribute("href"))!;
  const url = new URL(href);
  expect(url.hostname).toBe("mail.google.com");
  expect(url.searchParams.get("to")).toMatch(/@/);
  expect(url.searchParams.get("su")).toBe(subject);
  const pitchShot = await shot(page, "10-deals-pitch", { fullPage: true });
  // She sends it herself (never the dashboard); she says she sent it 6 days ago → follow-up 1 due.
  await page.getByRole("button", { name: "Mark sent" }).click();
  const dlg = page.getByRole("dialog", { name: "Mark as sent" });
  const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  await dlg.getByLabel("When did you send it?").fill(sixDaysAgo);
  await dlg.getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.locator(".next-card")).toContainText(/follow-up 1/i);
  await page.goto("/");
  await expect(page.getByText(brand).first()).toBeVisible();
  evidence("10-deals", { pitch_brand: brand, gmail_host: url.hostname, pitch_chars: text.length, pitch_screenshot: pitchShot, home_followup_screenshot: await shot(page, "10-deals-home-followup") });
});

test("10d · a brand's offer is read; rate card + deal memo hold the terms; nothing went to a brand", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await page.goto("/deals");
  await page.getByRole("button", { name: "A brand wrote to me" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Brand name").fill("Phase0 Test Candles (TEST)");
  await dlg.getByLabel("Paste what the brand sent").fill(
    "Hi! We love your tablescapes. We'd like 1 TikTok video and 3 Instagram stories featuring our fall candle collection, posting before Oct 20. We can offer $400. We'd also want to use the video in paid ads for 12 months and ask for 6 months exclusivity in home fragrance. Payment net 90 after posting. Let us know! — Jess, Partnerships",
  );
  await dlg.getByRole("button", { name: "Read it" }).click();
  await expect(page.locator(".offer-read .verdict")).toBeVisible({ timeout: 120_000 });
  const terms = page.locator("dl.offer-terms");
  await expect(terms).toContainText("from their email");
  const read = (await page.locator(".offer-read").textContent()) ?? "";
  expect(read).toMatch(/400/);
  expect(read.toLowerCase()).toMatch(/red flag|exclusiv|net 90|12 months/);
  const offerShot = await shot(page, "10-deals-offer", { fullPage: true });
  // the memo: agreed fee + deliverables
  const edit = page.locator("details.terms-edit");
  if (!(await edit.getAttribute("open").then((v) => v !== null))) await edit.locator("summary").click();
  await page.getByLabel("Agreed fee ($)").fill("650");
  await page.getByLabel("Deliverables", { exact: true }).fill("1 TikTok video, 3 Instagram stories");
  await page.getByLabel("Deliverables", { exact: true }).blur();
  await expect(page.locator(".memo")).toContainText("650");
  const memoShot = await shot(page, "10-deals-memo", { fullPage: true });
  // rate card on the kit tab
  await page.goto("/deals?tab=kit");
  await expect(page.locator(".kit-bar")).toBeVisible(); // loaded
  await expect(page.locator(".rc-pkg").first().or(page.getByRole("button", { name: "Add starter packages" }).first())).toBeVisible();
  if (!(await page.locator(".rc-pkg").count())) await page.getByRole("button", { name: "Add starter packages" }).first().click();
  await expect(page.locator(".rc-pkg").first()).toBeVisible();
  const pkgs = await page.locator(".rc-pkg").count();
  // nothing sent to a brand: every email the dashboard sent since the run started went to the owner
  const sent = await emailsSince(/./, START);
  expect(sent.every((e) => e.to.length === 1 && e.to[0] === OWNER), sent.map((e) => e.to.join(",")).join(" | ")).toBe(true);
  const dbSent = d1<{ n: number }>(`SELECT COUNT(*) AS n FROM emails_sent WHERE sent_at >= '${new Date(START).toISOString()}' AND to_email NOT LIKE '%${OWNER}%'`)[0]?.n ?? 0;
  expect(dbSent, "no dashboard email to anyone but the owner").toBe(0);
  evidence("10-deals", { offer_screenshot: offerShot, memo_screenshot: memoShot, rate_card_packages: pkgs, emails_since_start: sent.length, emails_to_non_owner: dbSent });
});
