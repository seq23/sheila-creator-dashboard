#!/usr/bin/env node
// The day-358 walk (docs/reviews/2026-09-26-day-358.md): every screen on a phone (iPhone 13,
// 390 wide) and a 1280 desktop with a year of demo data loaded (scripts/seed-year.mjs), a
// screenshot each, plus what the review measures: how tall the page is (in phone screens), how
// many rows it draws and how long its API took. Local only: it refuses any base URL that is not
// 127.0.0.1 / localhost.
//   node scripts/day358-shots.mjs http://127.0.0.1:8811 docs/design/day-358/before
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [base = "http://127.0.0.1:8811", outDir = "docs/design/day-358/after"] = process.argv.slice(2);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  process.stderr.write("day358-shots: local server only\n");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const SCREENS = [
  ["home", "/"],
  ["dump", "/dump"],
  ["review-new", "/review"],
  ["review-approved", "/review?tab=approved", 'role=tab[name=/Approved/]'],
  ["review-rejected", "/review?tab=rejected", 'role=tab[name=/Rejected/]'],
  ["calendar", "/calendar"],
  ["deals", "/deals"],
  ["media-kit", "/deals?tab=kit"],
  ["research", "/research"],
  ["voice", "/voice"],
  ["stats", "/stats"],
  ["settings", "/settings"],
];

const report = {};
const browser = await chromium.launch();
for (const [size, ctxOpts] of [
  ["phone", { ...devices["iPhone 13"] }],
  ["desktop", { viewport: { width: 1280, height: 820 } }],
]) {
  const ctx = await browser.newContext(ctxOpts);
  // The first-visit tour is done (day 358 is not her first visit).
  await ctx.addInitScript(() => localStorage.setItem("ss-tour-done", "1"));
  const page = await ctx.newPage();
  for (const [name, route, tab] of SCREENS) {
    const apiTimes = [];
    const onResp = async (r) => {
      if (!r.url().includes("/api/")) return;
      const t = r.request().timing();
      apiTimes.push({ url: new URL(r.url()).pathname, ms: Math.round(t.responseEnd) });
    };
    page.on("response", onResp);
    await page.goto(base + route, { waitUntil: "networkidle" });
    // An older build ignores ?tab=: tap the tab the way she would.
    if (tab && !(await page.locator(`${tab}[selected=true]`).count())) {
      await page.locator(tab).first().click();
      await page.waitForLoadState("networkidle");
    }
    await page.waitForTimeout(600);
    page.off("response", onResp);
    const m = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      rows: document.querySelectorAll(".list-row, .clip-card, .deal-card, .prospect, .post-card, article").length,
    }));
    const file = path.join(outDir, `${name}-${size}.jpg`);
    // Long pages are cut at 6,000 px (the height is in measure.json): the picture is evidence, not an archive.
    const width = ctxOpts.viewport?.width ?? 390;
    await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(m.height, 6000) }, type: "jpeg", quality: 50 });
    report[`${name}-${size}`] = { ...m, screens: Math.round((m.height / m.viewport) * 10) / 10, api: apiTimes };
    process.stdout.write(`${name}-${size}: ${m.height}px (${(m.height / m.viewport).toFixed(1)} screens), ${m.rows} rows\n`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(path.join(outDir, "measure.json"), JSON.stringify(report, null, 2));
