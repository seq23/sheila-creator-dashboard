# Hallmark audit — before / after

Design pass on branch `design/hallmark-pass`, base `17522fc` (frozen main). Mode: **hallmark
redesign, multi-page flow, brand-preserve** (A Sheila Bruce Affair palette, faces and logo kept).
The locked system is `docs/design/DESIGN.md`.

## How the numbers were made (reproducible)

| Evidence | How | Where |
| --- | --- | --- |
| Hallmark evidence pack | `~/repo-tools/active/run_hallmark_audit.sh <repo> --mode full --brand-preserve --base-url … --storage-state … --route ×15` (v1.3.0; bundle sha `5fd8800b…`). The script prepares evidence and **does not score**. Its read-only guard refuses a tree under edit, so "before" ran on a detached checkout of `17522fc` | `hallmark-before/`, `hallmark-after/` (report, findings stub, runtime context, 45/45 browser captures ok) |
| Screenshots + layout metrics | `node docs/design/capture.mjs <before\|after>`: 19 screens × 390×844 and 1440×900, demo data only | `before/*.webp`, `after/*.webp`, `*/metrics.json` |
| Gate score | `node docs/design/hallmark-gates.mjs <tree> <metrics.json>`: the 32 slop-test gates (plus four the brief adds) that can be decided from source and measurements | `gates-before.json`, `gates-after.json` |
| Token discipline | `npm run validate` → `design-tokens` | `scripts/validators/design-tokens.mjs` |

## Headline

| Measure | Before | After |
| --- | --- | --- |
| **Hallmark gates passed (automated, 32)** | **9** | **32** |
| Raw values outside tokens.css (validator rule) | 329 (207 spacing · 88 font-size · 18 colour · 16 inline type/spacing) | **0** |
| Distinct font sizes in app CSS | 35 | 12 named tokens (`--text-*`) |
| Tap targets under 44 px (38 captures) | 116 | **0** |
| Clickable labels wrapping to two lines | 1 | 0 |
| Screens whose next step is below the fold | 7 | **0** |
| Screens with no marked next step | 34 captures unmarked | 0 unmarked · Help has none by design |
| Horizontal scroll at 390 / 1440 | 0 | 0 |
| Unnamed icon buttons | 0 | 0 |
| Type families | 4 (mono used for numbers) | 3 + mono for codes only |

Failing gates before (count of instances): 6 side stripes (8) · 8 pure white (2) · 14 hover
moves + shadows (2) · 15 animated width (1) · 16 focus ring transitioned (3) · 21 no stamp ·
26 off-scale spacing (241) · 28 icon-button disabled state · 29 no reduced-motion · 32 Unicode
glyph icons (17) · 39 four families · 42 input focus by border/shadow · 46 warning text 3.16:1 ·
47 focus ring 1.74:1 · 53 centred-everything empty state · 58 raw colours outside tokens (28) ·
59 wrapping label · 61 bare `1fr` tracks (8) · 62 no `overflow-x: clip` · 63 no long-word wrap ·
A1 tap targets (116) · A3 next step below fold (7) · A4 logo `alt=""` (2). After: none.

## Gates judged by eye (not scriptable)

Looked at every `after/*.webp` at both widths.

| Gate | Verdict | Evidence |
| --- | --- | --- |
| 3 three equal icon-tile cards | pass | no icon-over-heading tiles anywhere |
| 4 card in card | pass | Deals detail reason box is now hairline-ruled, not a box; Client Brain's duplicate empty box removed |
| 7 full-viewport centred hero | INTENTIONAL | the login is one centred card on the full-height brand gradient: a sign-in, not a hero |
| 9/10 structure | pass | app pages share the Workbench shape by design (multi-page flow inverts variety) |
| 17 toasts for visible effects | INTENTIONAL | "Saved." after edits stays: she is non-technical and `change-posts-per-week.md` tells her to look for it |
| 25 accent footprint ≤ 5 % | pass | the gold fill is the one primary button per screen |
| 27 prose measure | pass | ledes and empty-state text capped at 68ch |
| 41/43/45 input states | pass | 1 px borders in every state; inputs and buttons share 44 px; disabled = opacity + cursor + native `disabled` |
| 44 reserved helper slot | N/A | the app has no inline field errors; errors are toasts with a How to fix link |
| 48/50 button fill and dark surfaces | pass | text on gold is `--accent-ink`; espresso surfaces set `--on-dark` and a gold focus ring |
| 51/52 nav and footer | pass | side rail (N3) + phone tab bar with a Menu sheet; no footer |
| 55/56/57 | pass | no decoration without purpose, no invented numbers (demo data only), no redrawn chrome |
| 66/67/68 | pass | no eyebrow beside a heading, no all-caps display type, no second sticky at top: 0 |

## Screens touched

| Screen | What changed |
| --- | --- |
| Shell (every screen) | One hand-drawn line-icon set replaces the Unicode glyphs; sidebar in three groups with hairline rules; the logo has alt text; the health line links to Settings. On phones a **Menu** tab opens a sheet with Deals, Client Brain, Research, Stats, Voice, Settings and Help, which were unreachable from the old tab bar |
| Login | Framed card with the brand's inset hairline; script greeting on the type scale |
| Home | "Waiting for you" first, as the one framed card; stats are 2×2 on a phone; per-platform counts are a tidy list; the Health card links to Connect when nothing is connected; card-shaped skeletons |
| Dump | Lede; the next step moves from "Choose videos" to "Dump" once something is uploaded; the × is an icon; numbers use tabular figures |
| Review | 44 px platform chips; one primary ("Approve all N"); the alternate hook is a quoted line plus a short button (no wrapping label); the modal Save is primary |
| Calendar | Page head renders before data (no bare skeleton); platform shown by a dot, not side stripes; prev/next icons; 44 px "How to fix" / "See it" |
| Client Brain | Lede instead of an uppercase sentence; one empty state; the primary follows the state (Choose docs → Draft my profile → Lock profile) |
| Research | Primary follows the state (Approve brief / Refresh research); the section chips scroll inside their own row on a phone; source links are 44 px targets |
| Stats | "Sync now" is now **"Update numbers"** (spec and guide updated); tabular figures |
| Settings + Health | Two columns at ≥ 1100 px; rows capped so a label sits beside its control; "Connect accounts" is the gold primary in the head; each light is named in words ("Working", "Not working") |
| Connect | No duplicated section/card titles; key rows capped; "Disconnect everything" moved to a "Start over" section at the end; the primary is the first thing not yet connected |
| Deals | "Find brands now" moves into the head as the primary; stage counters 3×2 on a phone; check icons for met TikTok One criteria; 44 px checkboxes |
| Media kit editor | Grouped form in two columns; "Save media kit" floats in reach at both widths |
| Media kit (public) | Letter shape: logo mark, script flourish, display name, "Work with me" under the bio (in view on a phone) and again at the end, stats as one strip |
| Voice | Off state is a proper empty state whose button is the primary; the consent line lost its side stripe; the consent label is a 44 px target |
| Help index | Fix-it is one left-aligned list; "Still stuck?" left-aligned; checklist links are 44 px |
| Help guide | Sticky Back / Next with "Next" primary; the breadcrumb chevron is an icon; step numbers use lining figures |
| Tour | On a phone, steps for screens behind the Menu tab point at the Menu tab |

Guides reworded where a screen's words changed (`connect-stats`, `connect-openrouter`,
`connect-firecrawl`, `connect-hunter`, `reconnect-google`, `reconnect-meta`, `upload-brand-docs`,
`mark-a-reply`). `reconnect-tiktok` was repaired: it told her to tap a Reconnect button that has
never existed; it now walks the export upload that actually refreshes TikTok stats.

## Guard

`design-tokens` (registered in `scripts/validate.mjs`) fails the build on any raw colour, font name,
raw font size, off-scale spacing value, inline typographic or spacing style, or undefined
`var(--…)` in `app/` outside `tokens.css`. It checks 3,700+ declarations; zero items fails (Rule 0).
Negative proof: appending `.probe { color: #ff0000; font-size: 13px; font-family: Arial; padding: 7px; }`
to `app/styles/stats.css` gave four named failures and `validate` exit 1; after restoring, it passed.

## Not proven

- **Dark mode** tokens are kept coherent (`tokens.css`), but dark mode was not captured or looked at. The brief does not require it.
- **Real phones:** the captures are Chromium at 390×844 with touch emulation. Nothing was checked on iOS Safari (safe-area insets, `100dvh`).
- **Screen readers:** only named controls and landmarks were checked. There was no VoiceOver or NVDA pass.
- **The 32-gate score comes from a script written in this pass** (`hallmark-gates.mjs`). It encodes the slop-test gates it can decide. The remaining gates are the by-eye table above.
