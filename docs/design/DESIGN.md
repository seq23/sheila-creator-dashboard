# Design — Sheila Studio

A locked design system for Sheila's creator dashboard (Hallmark multi-page flow: one system,
every screen reads it). Brand-preserve: palette, faces and logo come from A Sheila Bruce Affair
(`github.com/seq23/sheila-bruce`). Do not regenerate per page — amend this file when the system
needs to grow. The rules marked **guarded** are enforced by `scripts/validators/design-tokens.mjs`
(`npm run validate`); the rest by `docs/design/capture.mjs` metrics and the e2e suite.

## Genre and shape

- **Genre:** editorial, warm. Cream paper, espresso ink, gold as the single accent, rose script
  as the one flourish.
- **App pages (every screen behind login):** *Workbench* — espresso sidebar (desktop) or bottom
  tab bar (phone), a page head (title + one-line lede + the screen's one action), then the work
  surface. Two columns at ≥ 1100 px wherever the wireframe shows two (Home, Dump, Calendar,
  Client Brain, Research, Deals, Settings, Help); one column on a phone.
- **Public page (media kit `/kit/:slug`):** *Letter* — a single centred column, logo mark, script
  name flourish, stats strip, clips, one "Work with me" action.
- **Login:** one framed card on the login gradient.

## Theme (tokens.css — **guarded**: the only file with raw values)

| Role | Token | Value |
| --- | --- | --- |
| Paper | `--bg` / `--cream` | #f7f1e7 |
| Card | `--surface` / `--ivory` | #fffaf1 |
| Input well | `--surface-2` / `--paper` | #fffdf8 |
| Ink | `--text` / `--espresso` | #211713 |
| Muted text | `--text-muted` | #665850 (6.0:1 on cream) |
| Accent fill | `--accent` / `--gold` | #d7b56d, text on it `--accent-ink` (9.0:1) |
| Gold as text | `--gold-ink` | #7a5a1c (6.1:1) |
| Script | `--rose` | #8f4b5b |
| Warning text | `--warning-ink` | #85510a (5.4:1 on its soft fill) |
| Focus | `--focus-color` | rose on light surfaces, gold on espresso (both ≥ 3:1) |

Dark mode tokens exist (`prefers-color-scheme` and `[data-theme="dark"]`) and are kept coherent;
they are not a requirement of this pass.

## Typography (**guarded**)

- Display: Playfair Display 600/700 (`--font-display`) — page titles, section heads, card
  titles, stats.
- Body: Montserrat 400–800 (`--font-body`).
- Outlier: Allura (`--font-script`) — the brand flourish only: the sidebar sub-line, the login
  greeting, the door letters on Dump, the media-kit name flourish. Never body text.
- Mono (`--font-mono`) — times, codes and counts only.
- Scale: `--text-2xs` 12 · `--text-xs` 13 · `--text-sm` 14 · `--text-base` 16 · `--text-md` 18 ·
  `--text-lg` 22 · `--text-xl` 28 · `--text-2xl` clamp(30→42) · `--text-display` clamp(38→61) ·
  `--text-script` 30. Nothing below 12 px.

## Spacing (**guarded**)

4-pt named scale: `--space-3xs` 4 · `--space-2xs` 8 · `--space-xs` 12 · `--space-sm` 16 ·
`--space-md` 24 · `--space-lg` 32 · `--space-xl` 48 · `--space-2xl` 72. Gaps, paddings and
margins use these; hairlines ≤ 2 px are the only literals.

## Components

- **Buttons** — one pill voice. `.btn` gold fill (primary: the screen's next step, mark it
  `data-primary`), `.btn.dark` espresso (secondary emphasis), `.btn.quiet` outline, `.btn.danger`
  outline red. Every button, including `.small`, is at least 44 px tall. One hover signal (colour),
  a 1 px press, no scale, no bounce.
- **Cards** — ivory, 1 px gold-soft border, 20 px radius, soft shadow. `.card.accent` adds the
  brand's inset hairline frame (from the sheila-bruce hero card) — at most one per screen, on
  the thing that needs her. No card inside a card.
- **Icons** — one hand-drawn line set (`app/components/Icon.tsx`), 1.7 stroke. No emoji or
  Unicode glyphs as icons. Icon-only buttons carry an `aria-label`.
- **Empty states** — left-aligned, dashed gold frame, a sentence that says what to do next and a
  button that does it.
- **Errors** — a sentence plus a **How to fix** link to the guide (`fix_guide`), in the toast and
  on the screen.
- **Loading** — `<Skeleton blocks>` shaped like the content (cards) or `<Skeleton lines>` (text);
  the page head always renders first so nothing jumps.
- **Modals** — close icon top-right; on phones they become a bottom sheet; they scroll inside
  themselves (`max-height` + `overflow-y`).
- **Navigation** — desktop sidebar in three groups (daily · business · setup) with hairline
  rules; phone tab bar Home · Dump · Review · Calendar · **Menu** (a sheet with every other
  screen; the guides say "tap X in the menu").

## Motion

`--ease-out` cubic-bezier(0.16, 1, 0.3, 1), `--dur-short` 160 ms. Transitions name their
properties (never `all`). Focus rings appear instantly. `prefers-reduced-motion: reduce` turns
off every animation and transition and the skeleton shimmer.

## Microcopy

Plain words: Dump, Review, Calendar, connect, send, key. No "sync", "dispatch", "token" on
screen. Every empty state says what to do next; every error says what to click.

## Per-page allowances

- The media kit may use the large display size and the script flourish at `--text-script-lg`.
- App pages carry no decorative enrichment: function carries the page.

## What every screen shares

The logo mark, the accent and where it sits, the three faces, the button shape, the page-head
rhythm (title → lede → action), the 44 px touch floor, and the `?` help button.
