# sheila-creator-dashboard — working rules

Read `README.md` first, then `docs/BUILD_PLAN.md` for the locked decisions. `RUNBOOK.md` is the
operational reference ("runbook sheila" opens it).

## What this repo is

- Sheila's creator dashboard. Owner: Sheila. The builder hands off; after handoff she never
  needs a terminal. Every screen has one obvious next action; every error says what to click.
- **Public repo** (unlimited Actions minutes for video cutting). Section 13 rules are enforced
  by validators, not remembered.
- Cost target $0/month. Optional levers are switches in Settings, ON by default (owner, 26 Sep
  2026: "nothing should be hidden - she can use it if she chooses, nothing switched off"); she
  turns them off herself. No switch ever hides a screen, nav item or button (validator
  `nothing-hidden`).

## Locked decisions you do not reopen

Real footage only (no AI video) · two-door Dump · nothing posts without approval · hard cap 10
posts per channel per week · Buffer free plan for posting · OpenRouter free models default ·
nothing hidden, nothing switched off by default · research brief approved before the first cut ·
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
  a line under "Sample: named stops" in RUNBOOK). Example: the monthly brief refresh makes a
  new draft and emails her; it never pauses for approval, the approved brief stays live.
  `tests/unit/staging-env.test.ts` reads this line.
- Tests: strengthen, never weaken. A stub that "does nothing" is a stop the UI names, not a
  silent pass.

## Deploy

`land <pr>` (from `~/bin`). Never bare `wrangler deploy`. Build first, test in batches: the
merge gate is `check.yml` (typecheck, unit, validators, build, under 5 min); `land` merges on
green, deploys **staging** from the merge sha, and then ships **production** by the size of the
change (owner, 2 Oct 2026): a **small** change goes to production at once, on the fast check
alone, recorded as "small change: N lines, M files; shipped on the fast check, e2e on demand";
after a **large** change `land` runs `e2e.yml` on main itself and ships only on green. "Large" is
defined once, in the `large` block of `land` (seq23/seq-bin) — this repo restates no threshold.
A **known-red** e2e (the newest run on main that reached a verdict is not success; cancelled runs
do not count) blocks every small change until a green run is newer. `e2e.yml`
(e2e, e2e-open, help-screenshots) runs only on `workflow_dispatch`, never on a schedule or per
merge. **A successful E2E dispatch on main triggers production promotion:** `promote.yml` fires on every green
`e2e` run of main and runs `scripts/deploy-production.sh` from exactly the sha that passed (repo
secrets `CLOUDFLARE_API_TOKEN` = vault `cloudflare-claude-deploy`, `CLOUDFLARE_ACCOUNT_ID`),
smokes `/healthz`, and records a GitHub Deployment (environment `production`) — the same record
`land --promote sheila-creator-dashboard [--run-e2e]` writes and reads, so the by-hand path still
works and the two agree (a sha production already runs is skipped, not redeployed). By hand
without `land`: `gh workflow run e2e.yml --ref main`, or `gh workflow run promote.yml -f sha=<sha>`
(refused unless a green `e2e` run exists on that sha, or it is given `-f reason=` — land's
small-change verdict — with `check.yml` green on that sha and the suite not known red;
`scripts/production-gate.mjs` decides, for every path). Validator `promote-on-green` pins this
shape: `e2e.yml` never on push/pull_request, `promote.yml` only on `workflow_run` of e2e +
dispatch, every path through the gate, and the gate's own table. `npm run deploy:production` by hand is the break-glass, not the route.
Production URL: https://sheilastudio.seq-taylor.workers.dev (Worker `sheilastudio`, until her
domain). Production has no login (`AUTH_MODE` "open"): with open mode anyone who has the URL
is the owner; that is by her choice; switching back is `AUTH_MODE: "code"` and a deploy
(`REQUIRED_AUTH_MODE` in `scripts/validators/envs-match.mjs` pins it). Local and e2e keep the
email code; `npm run e2e` proves code mode, `npm run e2e:open` open mode.

Staging is the **public sample** (owner, 26 Sep 2026): https://samplestudio.seq-taylor.workers.dev
(Worker `samplestudio`), no login, `FAKE_SERVICES` "1" so nothing real can post or spend,
`ENV_NAME` "sample", filled with a year of demo data (`node scripts/seed-year.mjs --remote-sample
--apply`; re-run it to reset what visitors changed). It is `env.staging` in `wrangler.jsonc` with
the staging D1/R2; `npm run validate:envs` pins its name, URL, mode and fakes and fails if it drifts
from production in anything else but its D1/R2 and OWNER_EMAIL. `land` deploys it on every merge,
so the sample is always main, and production is main as soon as `land` has shipped it (at
once for a small change, after a green e2e for a large one). Sheila's production is
never touched by it.
