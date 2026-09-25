#!/usr/bin/env node
// Scores the Hallmark slop-test gates (hallmark/references/slop-test.md, bundle sha 5fd8800b…)
// that can be decided from source + the capture metrics, for one tree:
//
//   node docs/design/hallmark-gates.mjs <root> <metrics.json>
//
// <root> is a checkout whose app/ is scored (the base commit for "before", this branch for
// "after"). Gates that need a human eye are listed in docs/design/AUDIT.md with the verdict and
// the evidence; this script only scores what it can prove. Prints JSON: per gate pass/fail +
// evidence, and the pass count.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const [root, metricsPath] = process.argv.slice(2);
if (!root || !metricsPath) throw new Error("usage: hallmark-gates.mjs <root> <metrics.json>");
const metrics = JSON.parse(readFileSync(metricsPath, "utf8")).metrics;

function walk(dir, exts) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}
const app = path.join(root, "app");
const css = walk(app, [".css"]).map((f) => ({ f: path.relative(root, f), t: readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));
const cssRaw = walk(app, [".css"]).map((f) => ({ f: path.relative(root, f), t: readFileSync(f, "utf8") }));
const tsx = walk(app, [".tsx"]).map((f) => ({ f: path.relative(root, f), t: readFileSync(f, "utf8") }));
const hits = (files, re) => files.flatMap(({ f, t }) => [...t.matchAll(new RegExp(re, "g"))].map((m) => `${f}: ${m[0].trim().slice(0, 70)}`));
const blocks = (re) => css.flatMap(({ f, t }) => [...t.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => re.test(m[1])).map((m) => ({ f, sel: m[1].trim(), body: m[2] })));
const allMetrics = Object.entries(metrics);

const gates = [];
const gate = (n, name, evidence) => gates.push({ gate: n, name, pass: evidence.length === 0, evidence: evidence.slice(0, 8), count: evidence.length });

gate(1, "display font is not Inter/Roboto/Open Sans/Poppins/Lato/system", hits(css, /--font-display:[^;]*\b(?:Inter|Roboto|Open Sans|Poppins|Lato)\b/));
gate(2, "no purple-blue / cyan-magenta gradient", hits(css, /gradient\([^;]*(?:purple|violet|#8b5cf6|#6366f1)/i));
gate(5, "no gradient text (background-clip: text)", hits(css, /background-clip:\s*text/));
gate(6, "no thick side-stripe borders (border-left/right ≥ 3px, inset side box-shadow)", [...hits(css, /border-(?:left|right):\s*[3-9]px[^;]*/), ...hits(css, /box-shadow:\s*inset\s+[3-9]px\s+0\s+0[^;]*/)]);
gate(8, "no pure #fff / #000 as a colour", hits(css, /#(?:fff|ffffff|000|000000)\b/i));
gate(11, "no transition: all (or property-less transition)", hits(css, /transition:\s*(?:all\b|[\d.]+m?s)[^;]*/));
gate(13, "no bouncy overshoot easing", hits(css, /cubic-bezier\([^)]*,\s*1\.[1-9][^)]*\)/));
gate(14, "one hover signal per element (not transform + shadow together)", blocks(/:hover/).filter((b) => /transform/.test(b.body) && /box-shadow/.test(b.body)).map((b) => `${b.f}: ${b.sel}`));
gate(15, "no animated width/height/top/left/margin/padding", hits(css, /transition:[^;]*\b(?:width|height|top|left|margin|padding)\b[^;]*/));
// 16: the focus indicator must not be a property that a transition on the same element animates
{
  const focusBoxShadow = hits(css, /:focus(?:-visible)?\s*\{[^}]*box-shadow/).length > 0;
  const transitioned = hits(css, /transition:[^;]*box-shadow[^;]*/);
  gate(16, "focus ring appears instantly (not transitioned)", focusBoxShadow ? transitioned : []);
}
gate(21, "Hallmark stamp at the top of the stylesheet", cssRaw.some(({ t }) => /Hallmark · /.test(t)) ? [] : ["no /* Hallmark · … */ stamp in app/styles"]);
{
  // 26: off-scale spacing — reuse the repo validator's rule on this tree
  const bad = [];
  for (const { f, t } of css) {
    if (f.endsWith("tokens.css")) continue;
    for (const m of t.matchAll(/(?:^|[;{\s])(gap|row-gap|column-gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?)\s*:\s*([^;{}]+);/g)) {
      let v = m[2];
      for (let i = 0; i < 6; i++) v = v.replace(/\b(?:var|env)\([^()]*\)/g, " ");
      for (const x of v.matchAll(/-?\d*\.?\d+(px|rem|em)\b/g)) if (!(x[1] === "px" && Math.abs(parseFloat(x[0])) <= 2)) bad.push(`${f}: ${m[1]}: ${m[2].trim()}`);
    }
  }
  gate(26, "spacing on the named 4-pt scale", bad);
}
{
  const g = css.map((c) => c.t).join("\n");
  const missing = [];
  if (!/:focus-visible/.test(g)) missing.push(":focus-visible");
  if (!/\.btn:active/.test(g)) missing.push(".btn:active");
  if (!/\.btn:disabled/.test(g)) missing.push(".btn:disabled");
  if (!/\.(?:input|select|textarea)[^{]*:disabled/.test(g)) missing.push("input :disabled");
  if (!/\.icon-btn:disabled|\.stepper button:disabled/.test(g)) missing.push("icon button :disabled");
  gate(28, "interactive states present (focus-visible, active, disabled)", missing);
}
{
  const g = css.map((c) => c.t).join("\n");
  const animated = /@keyframes|animation:|transform/.test(g);
  gate(29, "every motion has a prefers-reduced-motion fallback", animated && !/prefers-reduced-motion:\s*reduce/.test(g) ? ["no @media (prefers-reduced-motion: reduce)"] : []);
}
gate(32, "one icon voice (no Unicode glyphs standing in for icons)", hits(tsx, /(?:icon:\s*"[^"a-z]{1,2}"|>\s*[⌂＋▶▦✦◎◈▲♪⚙‹›×✓✕↗]\s*<)/u));
gate(35, "decorative svg/canvas has aria-hidden or a name", hits(tsx, /<svg(?![^>]*aria-(?:hidden|label))[^>]*>/));
gate(36, "no horizontal scroll at 390 or 1440", allMetrics.filter(([, m]) => m.overflowX > 0).map(([k, m]) => `${k} +${m.overflowX}px`));
{
  // 39: three families max — mono counts when used for anything but codes
  const families = new Set(hits(css, /font-family:\s*var\((--font-[a-z]+)\)/).map((h) => /--font-[a-z]+/.exec(h)[0]));
  const monoNonCode = hits(css, /[^{}]*\{[^{}]*font-family:\s*var\(--font-mono\)/).filter((h) => !/code|key|\.mono\s*\{/.test(h)); // .mono is the codes/links/ids class (DESIGN.md)
  gate(39, "at most three type families (display, body, one outlier)", [...families].filter((f) => f !== "--font-mono").length > 3 || monoNonCode.length ? [`families: ${[...families].join(", ")}`, ...monoNonCode] : []);
}
gate(42, "input focus uses outline, not a border/box-shadow change", blocks(/\.(?:input|textarea|select)[^{]*:focus/).filter((b) => !/outline:\s*2px solid/.test(b.body)).map((b) => `${b.f}: ${b.sel}`));
{
  // 46: body text on its surface ≥ 4.5:1 — the token pairs used for text (computed)
  const tok = readFileSync(path.join(app, "styles", "tokens.css"), "utf8");
  const get = (n) => new RegExp(`${n}:\\s*(#[0-9a-f]{6})`, "i").exec(tok)?.[1];
  const L = (h) => {
    const c = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const mix = (fg, a, bg) => "#" + [0, 2, 4].map((i) => Math.round(parseInt(fg.slice(1 + i, 3 + i), 16) * a + parseInt(bg.slice(1 + i, 3 + i), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  const ivory = get("--ivory");
  const warnText = /\.pill\.warn\s*\{[^}]*color:\s*var\((--[a-z-]+)\)/.exec(css.map((c) => c.t).join("\n"))?.[1];
  const warnHex = get(warnText ?? "--warning");
  const pairs = [
    ["muted text on cream", get("--muted"), get("--cream")],
    ["muted text on ivory", get("--muted"), ivory],
    ["warning pill text on its fill", warnHex, mix(get("--warning"), 0.14, ivory)],
    ["success pill text on its fill", get("--success"), mix(get("--success"), 0.14, ivory)],
    ["danger pill text on its fill", get("--danger"), mix(get("--danger"), 0.12, ivory)],
    ["rose script on cream", get("--rose"), get("--cream")],
  ];
  gate(46, "body text ≥ 4.5:1 on its surface", pairs.filter(([, a, b]) => a && b && cr(a, b) < 4.5).map(([n, a, b]) => `${n} ${a} on ${b} = ${cr(a, b).toFixed(2)}:1`));
  // 47: the focus indicator ≥ 3:1 against the page
  const g = css.map((c) => c.t).join("\n");
  const ringVar = /:focus-visible\s*\{[^}]*outline:\s*2px solid var\((--[a-z-]+)\)/.exec(g)?.[1];
  const ringHex = ringVar ? get(ringVar) ?? get(/--focus-color:\s*var\((--[a-z-]+)\)/.exec(tok)?.[1] ?? "") : get("--gold");
  gate(47, "focus ring ≥ 3:1 against the page", ringHex && cr(ringHex, get("--cream")) >= 3 ? [] : [`focus ring ${ringHex ?? "gold box-shadow"} on cream = ${ringHex ? cr(ringHex, get("--cream")).toFixed(2) : "1.74"}:1`]);
  gate(49, "accent fill has a named text token (accent-ink)", /--accent-(?:ink|text):/.test(tok) ? [] : ["no --accent-ink"]);
}
gate(53, "no centred-everything blocks (empty states, help boxes)", blocks(/^\s*\.empty\s*$/).filter((b) => /text-align:\s*center/.test(b.body) && /align-items:\s*center/.test(b.body)).map((b) => `${b.f}: ${b.sel}`));
gate(58, "no colour/font improvisation outside tokens.css", [...css.filter((c) => !c.f.endsWith("tokens.css")).flatMap(({ f, t }) => [...t.matchAll(/(?:#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\()/gi)].map(() => f)), ...hits(tsx, /style=\{\{[^}]*font(?:Size|Family)[^}]*\}\}/)]);
gate(59, "no clickable label wraps to two lines", allMetrics.flatMap(([k, m]) => (m.wrappedLabels ?? []).map((w) => `${k}: ${w}`)));
gate(61, "image-bearing 1fr grid tracks use minmax(0, 1fr)", hits(css, /grid-template-columns:\s*(?:repeat\(\d+,\s*)?1fr[^;]*/));
{
  const g = css.map((c) => c.t).join("\n");
  gate(62, "html and body overflow-x: clip", /html\s*\{[^}]*overflow-x:\s*clip/.test(g) && /body\s*\{[^}]*overflow-x:\s*clip/.test(g) ? [] : ["overflow-x: clip missing on html/body"]);
  gate(63, "display heads break long words (overflow-wrap: anywhere)", /h1[^{]*\{[^}]*overflow-wrap:\s*anywhere/.test(g) ? [] : ["h1 lacks overflow-wrap: anywhere"]);
}
// extras the brief asks for, measured
gate("A1", "tap targets ≥ 44 px (all screens, both viewports)", allMetrics.flatMap(([k, m]) => m.smallTargets.map((s) => `${k}: ${s}`)));
gate("A2", "every icon/unnamed button has a name", allMetrics.flatMap(([k, m]) => m.unnamedButtons.map((s) => `${k}: ${s}`)));
gate("A3", "the screen's next step is visible without scrolling", allMetrics.filter(([, m]) => m.primary && !m.primary.aboveFold).map(([k]) => k));
gate("A4", "the logo has alt text", hits(tsx, /<img[^>]*sheila-logo[^>]*alt=""/));

const passed = gates.filter((g) => g.pass).length;
process.stdout.write(JSON.stringify({ passed, of: gates.length, gates }, null, 2) + "\n");
