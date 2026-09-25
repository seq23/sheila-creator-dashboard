// The help screenshots job (section 12c): for every guide in help/index.json, open its screen
// with demo data (tests/e2e/seed-demo.sql, never her real content), draw a numbered circle and
// an arrow on the element each step names, and save help/screenshots/<slug>-<n>.png (desktop
// project) and <slug>-<n>-phone.png (phone project). The frontmatter contract is documented in
// help/index.json "_contract" and parsed by app/lib/markdown.ts, the same parser the app uses.
//
// Runs with the e2e suite (post-merge on main) and on its own: `npm run help:screenshots`
// (job-help_screenshots.yml, on every release). Steps on outside sites (route: external) are
// captured by the builder by hand and skipped here.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseGuide, SCREEN_ROUTES, type ParsedGuide } from "../../app/lib/markdown";
import { clearDemo, seedDemo, setVoice, TOUR_OFF } from "./demo";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "help", "screenshots");
const index = JSON.parse(readFileSync(path.join(ROOT, "help", "index.json"), "utf8")) as { guides: { slug: string; screen: string | null }[] };

const guides: { slug: string; parsed: ParsedGuide }[] = index.guides.map((g) => ({
  slug: g.slug,
  parsed: parseGuide(readFileSync(path.join(ROOT, "help", "guides", `${g.slug}.md`), "utf8")),
}));

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright }, info) => {
  mkdirSync(OUT, { recursive: true });
  seedDemo();
  const ctx = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: "test-results/.auth/owner.json" });
  await setVoice(ctx, true); // the Voice guide shows the screen switched on
  await ctx.dispose();
});

test.afterAll(async ({ playwright }, info) => {
  const ctx = await playwright.request.newContext({ baseURL: info.project.use.baseURL, storageState: "test-results/.auth/owner.json" });
  await setVoice(ctx, false).catch(() => undefined);
  await ctx.dispose();
  clearDemo();
});

test("every guide has at least one step and a known screen", () => {
  expect(guides.length).toBeGreaterThan(0);
  for (const g of guides) {
    expect(g.parsed.steps.length, g.slug).toBeGreaterThan(0);
    expect(g.parsed.meta.screen && SCREEN_ROUTES[g.parsed.meta.screen], `${g.slug}: screen '${g.parsed.meta.screen}'`).toBeTruthy();
  }
});

for (const g of guides) {
  test(`screenshots: ${g.slug}`, async ({ page, browser }, info) => {
    const phone = info.project.name === "phone";
    const loggedOut = g.parsed.meta.screen === "login";
    let p: Page = page;
    if (loggedOut) {
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() ?? undefined });
      p = await ctx.newPage();
    }
    await p.addInitScript(TOUR_OFF);
    let shots = 0;
    for (const [i, step] of g.parsed.steps.entries()) {
      if (!step.image) continue;
      const route = step.route ?? SCREEN_ROUTES[g.parsed.meta.screen ?? "home"] ?? "/";
      if (route === "external") continue;
      await p.goto(route);
      await p.locator("main h1, .kit h1, .login-card h1").first().waitFor({ timeout: 10_000 });
      await settled(p);
      if (step.click) {
        const c = p.locator(step.click).first();
        if (await c.isVisible({ timeout: 3000 }).catch(() => false)) {
          await c.click();
          await settled(p);
        }
      }
      const target = await findTarget(p, step.target);
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await drawCallout(p, target, i + 1);
      const file = path.join(OUT, `${g.slug}-${i + 1}${phone ? "-phone" : ""}.png`);
      await p.screenshot({ path: file, animations: "disabled" });
      await p.evaluate(() => document.getElementById("ss-callout")?.remove());
      shots++;
    }
    if (loggedOut) await p.context().close();
    // Rule 0: a guide whose every step is skipped must say so, never pass silently.
    const external = g.parsed.steps.filter((s) => s.route === "external").length;
    expect(shots + external, `${g.slug}: no screenshot taken`).toBe(g.parsed.steps.filter((s) => s.image).length);
  });
}

/** Loading placeholders gone, fonts in: the screen as she would see it. */
async function settled(p: Page) {
  await p.locator(".skeleton").first().waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
  await p.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** The step's target if it is on screen, else the page heading, so every shot has a callout. */
async function findTarget(p: Page, selector: string | null): Promise<Locator> {
  if (selector) {
    const t = p.locator(selector).first();
    if (await t.isVisible({ timeout: 1500 }).catch(() => false)) return t;
  }
  return p.locator("main h1, .kit h1, .login-card h1").first();
}

/** Numbered circle + arrow + ring on the element, drawn in the page so it lands in the PNG. */
async function drawCallout(p: Page, target: Locator, n: number) {
  const box = await target.boundingBox();
  if (!box) return;
  await p.evaluate(
    ({ box, n }) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const R = 22;
      // circle sits above-left of the element when there is room, else below-right
      let cx = box.x - 46;
      let cy = box.y - 46;
      if (cx < R + 8) cx = Math.min(vw - R - 8, box.x + box.width + 46);
      if (cy < R + 8) cy = Math.min(vh - R - 8, box.y + box.height + 46);
      if (cx > vw - R - 8) cx = Math.max(R + 8, box.x - 46);
      const tx = Math.max(box.x, Math.min(cx, box.x + box.width));
      const ty = Math.max(box.y, Math.min(cy, box.y + box.height));
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.id = "ss-callout";
      svg.setAttribute("width", String(vw));
      svg.setAttribute("height", String(vh));
      svg.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none");
      svg.innerHTML = `
        <defs><marker id="ss-ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8f4b5b"/></marker></defs>
        <rect x="${box.x - 5}" y="${box.y - 5}" width="${box.width + 10}" height="${box.height + 10}" rx="12" fill="none" stroke="#d7b56d" stroke-width="4"/>
        <line x1="${cx}" y1="${cy}" x2="${tx}" y2="${ty}" stroke="#8f4b5b" stroke-width="4" marker-end="url(#ss-ah)"/>
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="#8f4b5b" stroke="#fffaf1" stroke-width="3"/>
        <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#fffaf1">${n}</text>`;
      document.body.appendChild(svg);
    },
    { box, n },
  );
}
