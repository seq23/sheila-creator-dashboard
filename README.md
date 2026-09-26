# Sheila Creator Dashboard

Sheila dumps footage; the dashboard cuts it into vertical clips, she approves them, they post
through Buffer to TikTok, Instagram and YouTube on a schedule the research says works, and the
Deals tab finds brands and drafts pitches she sends herself. Owner: **Sheila**. Cost target:
**$0/month**. Nothing posts unless she approves it.

The plan is `docs/BUILD_PLAN.md` (locked decisions, every screen, data model, phases) and the
wireframes are `docs/wireframes/`. This README says what is **live**, what is **scaffolded**
and what only a person can check.

## Stack

| Job | Tool |
| --- | --- |
| App + API + crons | One Cloudflare Worker: React/Vite as static assets, Hono API under `/api`, three cron lanes |
| Login | Production: none (`AUTH_MODE` "open", every visitor is the owner). Staging, local and e2e: email one-time code (Resend), no passwords; owner + optional helper |
| Data | D1 (`migrations/`), R2 (`raw/`, `clips/`, `brain/`, `voice/`, `kit/`) |
| Heavy jobs | GitHub Actions, started only by the Worker (`repository_dispatch`, signed), `jobs/*.py`; files in and out only through the Worker (signed), never with storage keys |
| AI / search / posting / email | OpenRouter free models · Firecrawl · Buffer API · Resend |

Every outside service has a stand-in behind `FAKE_SERVICES=1` (the default in
`wrangler.jsonc`), so the whole app runs locally and in CI with no accounts.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run build && npm run dev        # http://localhost:8787 (Worker + built app)
npm run dev:app                     # optional: Vite HMR on :5173 proxying /api to :8787
```

Log in with the owner email from `wrangler.jsonc`; in local mode the 6-digit code is shown on
the login screen (`.dev.vars` sets `AUTH_MODE=code`; set it to `open` to run with no login, as
production does).

## Check it

```bash
npm run check      # typecheck + unit tests + validators + build   (the merge gate, < 5 min)
npm run e2e        # Playwright, phone + desktop, against wrangler dev with fake services (code mode)
npm run e2e:open   # the same, open mode (no login, as production runs), its own server and port
```

CI: `check.yml` on every PR (merge gate), `e2e.yml` post-merge on `main`, `job-*.yml` one per
job type, listening for its `repository_dispatch`.

## Deploy

```bash
land <pr>                        # from ~/bin: verifies green, merges, watches main, deploys
npm run deploy:production        # what land runs: build → D1 migrations → wrangler deploy
```

Never a bare `wrangler deploy` (stale client, fake services).

**Production** is the Worker `sheilastudio`: https://sheilastudio.seq-taylor.workers.dev. It
runs with no login (`AUTH_MODE` "open" in `wrangler.jsonc`): Sheila opens the URL and her
dashboard is there. With open mode anyone who has the URL is the owner; that is by her choice; switching back is `AUTH_MODE: "code"` and a deploy. (`REQUIRED_AUTH_MODE` in
`scripts/validators/envs-match.mjs` pins the mode, so change it there too.) Staging keeps the
email-code login.

**Staging** is the owner's fully real twin (own Worker, D1, R2; FAKE_SERVICES=0) for testing
with throwaway accounts while Sheila's production stays untouched:
`npm run deploy:staging` → https://sheila-creator-dashboard-staging.seq-taylor.workers.dev.
`npm run validate:envs` keeps it production's twin. RUNBOOK "Staging" has what is real, the
named stops (none) and the Phase 0 live checklist.

## Phase ledger

See `docs/PHASE-LEDGER.md` for what each phase delivered, what is proven by automated tests
and what is **not yet proven** (needs a person with the test accounts).

## Public-repo rules

Anyone can read this code and the Actions logs, so (section 13 of the plan):

- Logs carry step names, counts and pass/fail only. `worker/lib/log.ts` and `jobs/common.py`
  are the only places output is written; the validator `no-content-in-logs` refuses others.
- Her data lives only in her Cloudflare account (D1, R2). Keys live only in `wrangler secret`
  and GitHub Secrets; per-service keys she pastes are AES-GCM encrypted in D1.
- Jobs start only from the Worker with a signed, time-limited payload; job → Worker calls are
  signed the same way. Jobs hold no storage keys: they stream inputs from the Worker
  (`GET /api/jobs/:id/input/<key>`) and write outputs through its chunked upload, limited to
  their own folders (`worker/lib/jobStorage.ts`); the validator `jobs-no-direct-storage` fails
  if a job or workflow mentions an S3 client, an R2 credential or an S3 endpoint. Upload links are session-bound; clip links are long random tokens that
  expire 30 days after posting.

## Validators

`npm run validate` runs every file in `scripts/validators/`, each admitted in
`scripts/validate.mjs` with the harm it prevents. A validator that checks zero items fails
(Rule 0). Adding one means adding it to the register in the same PR.
