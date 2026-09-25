#!/usr/bin/env node
// Design-pass evidence: screenshots of every screen at phone (390×844) and desktop (1440×900),
// plus measured layout facts per screen (horizontal overflow, tap targets under 44 px, whether
// the primary action is visible without scrolling, unnamed icon buttons).
//
//   node docs/design/capture.mjs <before|after> [baseURL]
//
// Needs the e2e server running (E2E_PORT=8796 bash tests/e2e/serve.sh) after `npm run build`.
// Seeds the e2e demo data (tests/e2e/seed-demo.sql, never her real content) plus three draft (New tab)
// clips for Review, and removes everything again at the end. PNGs are converted to WebP with
// cwebp and kept under 300 KB. Writes docs/design/<label>/*.webp and docs/design/<label>/metrics.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const label = process.argv[2];
if (!["before", "after"].includes(label ?? "")) throw new Error("usage: capture.mjs <before|after> [baseURL]");
const BASE = process.argv[3] ?? "http://127.0.0.1:8796";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "design", label);
const TMP = path.join(OUT, ".png");
mkdirSync(TMP, { recursive: true });

const DB = "sheila-creator-dashboard-db";
const d1 = (args) => execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", ...args], { cwd: ROOT, stdio: "pipe", env: { ...process.env, CI: "1" } });
const SEED = path.join("tests", "e2e", "seed-demo.sql");
const seedSql = readFileSync(SEED, "utf8");
const cleanSql = seedSql.slice(0, seedSql.indexOf("INSERT")).split("\n").filter((l) => l.trim() && !l.startsWith("--")).join(" ");
const NEW_CLIPS = [
  ["demo_new_1", "Brunch for six, under an hour", 0.93],
  ["demo_new_2", "The linen trick my grandmother taught me", 0.88],
  ["demo_new_3", "Why I always set the table the night before", 0.8],
]
  .map(([id, hook, score], i) => `INSERT INTO clips (id, asset_id, dump_id, start_s, end_s, recipe, hook_text, hook_alt, caption, hashtags, score, r2_key, media_token, status) VALUES ('${id}', 'demo_ast', 'demo_dump', ${240 + i * 30}, ${266 + i * 30}, 'hook_first', '${hook.replace(/'/g, "''")}', 'Guests always ask how I do this', 'Demo caption for: ${hook.replace(/'/g, "''")}', '#hosting #brunch', ${score}, 'clips/${id}.mp4', 'demotokennew${i}xxxxxxxxxxxxxxxxxxxxxxxxxxx', 'draft');`)
  .join("\n");

// Every screen the design pass covers. `wait` is a selector that means "the screen is drawn".
const SCREENS = [
  { name: "login", route: "/", loggedOut: true, wait: ".login-card h1" },
  { name: "tour", route: "/", tour: true, wait: "main h1" },
  { name: "home", route: "/", wait: "main h1" },
  { name: "dump", route: "/dump", wait: "main h1" },
  { name: "review", route: "/review", wait: "main h1" },
  { name: "review-edit", route: "/review", wait: "main h1", click: "text=Edit caption & hook" },
  { name: "calendar", route: "/calendar", wait: "main h1" },
  { name: "brain", route: "/brain", wait: "main h1" },
  { name: "research", route: "/research", wait: "main h1" },
  { name: "stats", route: "/stats", wait: "main h1" },
  { name: "settings", route: "/settings", wait: "main h1" },
  { name: "health", route: "/settings", wait: "main h1", scrollTo: "[aria-label='Connections and health']" },
  { name: "connect", route: "/settings/connections", wait: "main h1" },
  { name: "deals", route: "/deals", wait: "main h1" },
  { name: "mediakit-editor", route: "/deals?tab=kit", wait: "main h1" },
  { name: "mediakit-public", route: "/kit/sheila", loggedOut: true, wait: ".kit h1, h1" },
  { name: "voice", route: "/voice", wait: "main h1" },
  { name: "help", route: "/help", wait: "main h1" },
  { name: "help-guide", route: "/help/dump-new-footage", wait: "main h1" },
];
const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { tag: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

async function login(ctx) {
  const r = await ctx.request.post(`${BASE}/api/auth/request`, { data: { email: "asheilabruceaffair@gmail.com" } });
  const { dev_code } = await r.json();
  if (!dev_code) throw new Error("fake services did not return a login code");
  const v = await ctx.request.post(`${BASE}/api/auth/verify`, { data: { email: "asheilabruceaffair@gmail.com", code: dev_code } });
  if (!v.ok()) throw new Error(`verify failed ${v.status()}`);
}

/** Layout facts, measured in the page. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const interactive = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]")).filter(visible);
  const small = [];
  for (const el of interactive) {
    if (el.closest(".sr-only")) continue;
    // inline links inside running text are exempt (WCAG 2.5.8 inline exception)
    if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, .hint, .notice, .toast, .meta")) continue;
    // native checkbox/radio inside a larger label target are exempt: the label is the target
    if ((el.type === "checkbox" || el.type === "radio") && el.closest("label")) {
      const lr = el.closest("label").getBoundingClientRect();
      if (lr.height >= 44 && lr.width >= 44) continue;
    }
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ").filter(Boolean).join(".") : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const unnamed = interactive
    .filter((el) => (el.tagName === "BUTTON" || el.tagName === "A") && !(el.getAttribute("aria-label") || el.getAttribute("title") || (el.textContent || "").trim().replace(/[^\p{L}\p{N}]/gu, "")))
    .map((el) => el.outerHTML.slice(0, 80));
  // The screen's one next step: explicit [data-primary] (the design pass marks it), else the
  // first filled button. Inside an open modal, the modal's own primary.
  const scope = document.querySelector(".modal") ?? document;
  // Hallmark gate 59: a button / nav / tab label that wraps onto two lines looks broken.
  const wrapped = Array.from(document.querySelectorAll(".btn, .nav a, .tabbar a, .tabbar button, [role=tab], .link-btn, .crumb a, .section-head > a, .more-sheet a"))
    .filter(visible)
    .filter((el) => {
      // a single run of text that breaks onto a second line (icon-over-label stacks are fine)
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 1).map((r) => Math.round(r.top)));
        if (tops.size > 1) return true;
      }
      return false;
    })
    .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 30)}"`);
  const primary = scope.querySelector("[data-primary]") ?? scope.querySelector(".btn:not(.quiet):not(.danger)");
  const pr = primary?.getBoundingClientRect();
  const tabbar = document.querySelector(".tabbar");
  // an open modal paints over the tab bar, so only the viewport bounds it
  const tabTop = tabbar && getComputedStyle(tabbar).display !== "none" && !document.querySelector(".modal") ? tabbar.getBoundingClientRect().top : vh;
  return {
    overflowX: document.documentElement.scrollWidth - vw,
    smallTargets: small,
    unnamedButtons: unnamed,
    wrappedLabels: wrapped,
    primary: primary ? { text: (primary.textContent || "").trim().slice(0, 40), marked: primary.hasAttribute("data-primary"), aboveFold: pr.bottom <= tabTop && pr.top >= 0 } : null,
    pageHeight: document.documentElement.scrollHeight,
  };
}

async function toWebp(png, webp) {
  for (const q of [80, 65, 50, 38]) {
    execFileSync("cwebp", ["-quiet", "-q", String(q), "-resize", "0", "0", png, "-o", webp]);
    if (statSync(webp).size < 300 * 1024) return;
  }
  // very tall pages: halve the resolution until it fits
  for (const w of [0.75, 0.5]) {
    const probe = execFileSync("sips", ["-g", "pixelWidth", png], { encoding: "utf8" });
    const px = Number(/pixelWidth: (\d+)/.exec(probe)?.[1] ?? 1440);
    execFileSync("cwebp", ["-quiet", "-q", "45", "-resize", String(Math.round(px * w)), "0", png, "-o", webp]);
    if (statSync(webp).size < 300 * 1024) return;
  }
  throw new Error(`${webp} is still over 300 KB`);
}

d1(["--file", SEED]);
d1(["--command", NEW_CLIPS]);
const browser = await chromium.launch();
const metrics = {};
// One login per run (the login rate limit is 5 codes per 15 minutes), shared by both viewports.
// CAPTURE_STORAGE=<playwright storage-state json> reuses an existing session instead.
let storageState = process.env.CAPTURE_STORAGE;
if (!storageState) {
  const c = await browser.newContext();
  await login(c);
  storageState = await c.storageState();
  await c.close();
}
try {
  for (const vp of VIEWPORTS) {
    const authed = await browser.newContext({ storageState, viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 });
    const voice = await authed.request.patch(`${BASE}/api/settings`, { data: { features: { voice: true } } });
    if (!voice.ok()) throw new Error(`voice on failed ${voice.status()}`);
    for (const s of SCREENS) {
      const ctx = s.loggedOut ? await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 1 }) : authed;
      const page = await ctx.newPage();
      await page.addInitScript((tour) => {
        try {
          if (tour) localStorage.removeItem("ss-tour-done");
          else localStorage.setItem("ss-tour-done", "1");
        } catch {
          /* ignore */
        }
      }, Boolean(s.tour));
      await page.goto(`${BASE}${s.route}`);
      await page.locator(s.wait).first().waitFor({ timeout: 15_000 });
      await page.locator(".skeleton").first().waitFor({ state: "detached", timeout: 6000 }).catch(() => undefined);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (s.click) {
        await page.locator(s.click).first().click();
        await page.waitForTimeout(300);
      }
      if (s.scrollTo) await page.locator(s.scrollTo).first().scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(250);
      const m = await page.evaluate(measure);
      // a scrolled-to view (Health) is judged on the section it scrolls to, not the page head
      if (s.scrollTo && m.primary) m.primary.aboveFold = null;
      metrics[`${s.name}@${vp.tag}`] = m;
      const png = path.join(TMP, `${s.name}-${vp.tag}.png`);
      // Full page for the page screens, viewport for overlays (tour, modal) and scroll targets.
      await page.screenshot({ path: png, fullPage: !(s.tour || s.click || s.scrollTo), animations: "disabled" });
      await toWebp(png, path.join(OUT, `${s.name}-${vp.tag}.webp`));
      await page.close();
      if (s.loggedOut) await ctx.close();
    }
    await authed.request.patch(`${BASE}/api/settings`, { data: { features: { voice: false } } }).catch(() => undefined);
    await authed.close();
  }
} finally {
  await browser.close();
  d1(["--command", "DELETE FROM clips WHERE id LIKE 'demo_new_%';"]);
  d1(["--command", cleanSql]);
  rmSync(TMP, { recursive: true, force: true });
}

const summary = {
  screens: Object.keys(metrics).length,
  overflowing: Object.entries(metrics).filter(([, m]) => m.overflowX > 0).map(([k, m]) => `${k} (+${m.overflowX}px)`),
  smallTargetCount: Object.values(metrics).reduce((n, m) => n + m.smallTargets.length, 0),
  unnamedButtons: Object.values(metrics).reduce((n, m) => n + m.unnamedButtons.length, 0),
  wrappedLabels: Object.values(metrics).reduce((n, m) => n + m.wrappedLabels.length, 0),
  primaryBelowFold: Object.entries(metrics).filter(([, m]) => m.primary && m.primary.aboveFold === false).map(([k]) => k),
  noPrimary: Object.entries(metrics).filter(([, m]) => !m.primary).map(([k]) => k),
  primaryUnmarked: Object.entries(metrics).filter(([, m]) => m.primary && !m.primary.marked).map(([k]) => k),
};
writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify({ summary, metrics }, null, 2) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
