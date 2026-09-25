# sheila-creator-dashboard — working rules

Read `README.md` first, then `docs/BUILD_PLAN.md` for the locked decisions. `RUNBOOK.md` is the
operational reference ("runbook sheila" opens it).

## What this repo is

- Sheila's creator dashboard. Owner: Sheila. The builder hands off; after handoff she never
  needs a terminal. Every screen has one obvious next action; every error says what to click.
- **Public repo** (unlimited Actions minutes for video cutting). Section 13 rules are enforced
  by validators, not remembered.
- Cost target $0/month. Optional paid levers are switches in Settings, off by default.

## Locked decisions you do not reopen

Real footage only (no AI video) · two-door Dump · nothing posts without approval · hard cap 10
posts per channel per week · Buffer free plan for posting · OpenRouter free models default ·
voice narration off until she switches it on · research brief approved before the first cut ·
public business contacts only for deals, she sends every pitch herself.

## Layout

```
app/        React + Vite (pages/ one file per screen, routed in App.tsx — the route ledger)
worker/     Hono Worker: routes/ (mounted in index.ts — the route ledger), domain/ (pure logic,
            unit-tested), services/ (real + fake per vendor), jobs/ (spec/result per job type,
            registered in jobs/registry.ts), crons/
shared/     constants.ts (caps, slots, recipes) and types.ts (API shapes) — one source
migrations/ D1, numbered; never edit a migration that has run in production
jobs/       Python jobs for GitHub Actions on common.py (signed calls, safe log, R2)
help/       guides/*.md (one per task) + index.json; the ? button on every screen opens one
scripts/    validate.mjs (admission register) + validators/, deploy-production.sh, deploy-staging.sh
tests/      unit/ (vitest, domain + crypto), e2e/ (Playwright, phone + desktop)
```

## Collision slots (fill a line, never restructure)

`app/App.tsx` routes · `worker/index.ts` app.route lines · `worker/jobs/registry.ts` ·
`scripts/validate.mjs` REGISTER · `help/index.json` · `migrations/000N_*.sql` (next number is
assigned in the brief that adds it) · `package.json` deps (union merge only).

## Rules

- **Fakes first.** A vendor call goes behind `worker/services/<vendor>.ts` with a fake that
  returns the failure shapes too. Tests prove each failure shows the right health light,
  email and fix guide.
- **Never log content.** `log.*` in the Worker, `log()` in jobs. The validator refuses
  `console.*` / `print()` anywhere else.
- **Every screen has a `?`** (`<HelpButton guide="slug" />`) and every `fix_guide` slug is a
  file in `help/guides/`. The validator `help-guides-exist` fails the build otherwise.
- **Plain words.** Dump, Review, Calendar. No jargon in UI copy or emails.
- **Phone first** for Dump and Review: 44 px targets, bottom tab bar under 900 px.
- **Design language** is A Sheila Bruce Affair (`app/styles/tokens.css`): cream/ivory, espresso,
  gold, rose script; Playfair Display + Montserrat + Allura. Not the wireframes' grey-blue.
- **Nothing waits on the owner.** A finding becomes an action with a measurement and an
  automatic fallback, never a question or a "waiting on the owner" stop. Only a secret or an
  account she alone holds may stop, and it stops as a NAMED stop (a health light + fix guide, or
  a line under "Staging: named stops" in RUNBOOK). Example: the monthly brief refresh makes a
  new draft and emails her; it never pauses for approval, the approved brief stays live.
  `tests/unit/staging-env.test.ts` reads this line.
- Tests: strengthen, never weaken. A stub that "does nothing" is a stop the UI names, not a
  silent pass.

## Deploy

`land <pr>` (from `~/bin`) or `npm run deploy:production`. Never bare `wrangler deploy`.
Production URL: https://sheila-creator-dashboard.seq-taylor.workers.dev (until her domain).

Staging (the owner's real twin, her throwaway accounts): `npm run deploy:staging`, URL
https://sheila-creator-dashboard-staging.seq-taylor.workers.dev. It is `env.staging` in
`wrangler.jsonc`; `npm run validate:envs` fails if it drifts from production beyond its name,
its D1/R2 and the vars OWNER_EMAIL, PUBLIC_BASE_URL, ENV_NAME, FAKE_SERVICES. After `land`,
run `npm run deploy:staging` from main so both match.
