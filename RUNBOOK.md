# Runbook — sheila-creator-dashboard

## Where things are

| Thing | Where |
| --- | --- |
| Production | https://sheila-creator-dashboard.seq-taylor.workers.dev (Cloudflare account SL Taylor, `8d147e242033699dd37c6f5a451f48d2`) |
| D1 | `sheila-creator-dashboard-db` (id in `wrangler.jsonc`) |
| R2 | `sheila-creator-dashboard-files` |
| Repo | https://github.com/seq23/sheila-creator-dashboard (public) |
| Logs | Cloudflare dashboard → Workers → sheila-creator-dashboard → Logs (observability on) |

## Secrets

Worker (`wrangler secret put NAME`): `SESSION_SECRET`, `SECRETS_KEY` (32 bytes base64),
`JOB_SHARED_SECRET`, `GITHUB_DISPATCH_TOKEN` (fine-grained PAT, contents:write on this repo),
`RESEND_API_KEY`.

Worker, optional (stats sign-in on Connections; without them the Instagram / YouTube buttons
stay disabled with a fix guide): `META_APP_ID`, `META_APP_SECRET` (a Meta app with Instagram
Login), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (a Google Cloud OAuth client, project "In
production", YouTube Data + Analytics APIs on). Register these redirect URIs on each app:
`<PUBLIC_BASE_URL>/api/oauth/meta/callback` and `<PUBLIC_BASE_URL>/api/oauth/google/callback`.

GitHub Actions secrets: `JOB_SHARED_SECRET` (same value), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` (an R2 API token scoped to the one bucket), `OPENROUTER_API_KEY`,
`FIRECRAWL_API_KEY`.

Per-user keys (Buffer, OpenRouter, Firecrawl, Hunter) are pasted on Settings → Connections and
stored AES-GCM encrypted in D1 `connections.secret_enc`.

## Common tasks

```bash
# query production
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT status, COUNT(*) FROM clips GROUP BY status"

# see recent jobs
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT id, type, status, safe_error, created_at FROM jobs ORDER BY created_at DESC LIMIT 10"

# tail logs
npx wrangler tail sheila-creator-dashboard --format pretty

# re-run a job by hand (fake mode only, local)
curl -X POST http://localhost:8787/api/jobs/<job_id>/run-fake -H 'Cookie: ss_session=…'
```

## Cron lanes

| Cron (UTC) | Lane | Does |
| --- | --- | --- |
| `0 * * * *` | buffer-sync | loads the next 7 days into Buffer, reads back status, retries failures twice |
| `30 13 * * *` | daily | runway email, retention (raw 7 d, rejected 7 d, clip links 30 d after posting), storage light |
| `0 * * * *` (same run) | brief draft notice | emails "New brief draft ready" once, when a draft newer than the approved brief lands |
| `30 13 * * *` (same run) | monthly brief refresh | on the 1st (retries the 2nd, 3rd) starts the research job for a new draft; the approved brief stays live, nothing waits for approval |
| `0 12 * * 1` | weekly | recap email, metrics + brand-finder jobs |
| `0 12 * * 1` (same run) | weekly brief adjustment | rewrites the live brief's `her_week` claims from the last 7 days, stamps `adjusted_at`; never approval, never web claims |

Each lane writes a health row `Last <lane> run`; red = the lane threw, note has the safe error.
The brief steps also write `Monthly brief refresh` / `Weekly brief adjustment` (why it ran or
did not). No fourth cron expression: the monthly refresh is a daily check that acts on the 1st.

## Staging

The owner's fully real twin of production for testing with her own throwaway accounts;
Sheila's production is never touched by it.

| Thing | Where |
| --- | --- |
| URL | https://sheila-creator-dashboard-staging.seq-taylor.workers.dev (`/healthz` → `{"ok":true,"fake":false,"env":"staging"}`) |
| Config | `wrangler.jsonc` `env.staging`; `npm run validate:envs` fails on any drift from production except name, D1/R2 and the vars OWNER_EMAIL, PUBLIC_BASE_URL, ENV_NAME, FAKE_SERVICES |
| D1 | `sheila-creator-dashboard-db-staging` (`c8e9e2c9-0c30-48c5-9c93-acf66a26979c`) |
| R2 | `sheila-creator-dashboard-files-staging` |
| Login | `seq.taylor@gmail.com` (OWNER_EMAIL) |
| Deploy | `npm run deploy:staging` (twin check → build → remote migrations → deploy → healthz must say `env: staging`). After every `land`, run it from `main` so both match. |

```bash
npx wrangler d1 execute sheila-creator-dashboard-db-staging --remote --env staging --command "SELECT name, light, note FROM health"
npx wrangler tail sheila-creator-dashboard-staging --format pretty
```

Secrets (`wrangler secret put <NAME> --env staging`, value on stdin): `SESSION_SECRET`,
`SECRETS_KEY`, `JOB_SHARED_SECRET` (fresh, staging-only), `RESEND_API_KEY` (the West Peek Resend
key, vault `resend-app-18f24eb6`). GitHub secret `JOB_SHARED_SECRET_STAGING` holds the same job
secret; every `job-*.yml` picks it (and the staging bucket) when the dispatch payload says
`env: staging`.

### What is real on staging

| Piece | State (25 Sep 2026) |
| --- | --- |
| Worker, D1, R2, crons | Real, all migrations applied |
| Buffer | Real: connected with vault `buffer-access-token` (one TikTok channel, `@iamcindymercer`; that Buffer account's Twitter channel is ignored). **That is a live TikTok account, not a throwaway**: before the Buffer post test, swap in the throwaway Buffer account on Connect (Disconnect, paste its key). |
| Email (Resend) | Key live, sending refused: see named stops. The health light says so (red, `connect-resend`). |
| OpenRouter, Firecrawl, Hunter, Instagram/YouTube stats | Not connected by design (Sheila's Hunter key stays hers). Connect shows "Not connected" with a guide; research and the brand finder refuse with the connect guide. |
| Jobs (cut, extract, research, metrics, brand finder, voice) | Blocked: see named stops. Health: `Job runner (GitHub)` red, `connect-github`. |

### Staging: named stops

Each is a secret or account only the owner holds; everything else is built.

1. **Staging email.** Resend answered 403 `validation_error`: "You can only send testing emails
   to your own email address … verify a domain at resend.com/domains, and change the `from`
   address to an email using this domain." The West Peek Resend account delivers only to its
   own address from `onboarding@resend.dev`. Fix: verify a domain for this app in the West Peek
   Resend account (or paste a Resend key from an account whose owner address is
   `seq.taylor@gmail.com`: `wrangler secret put RESEND_API_KEY --env staging`). Until then login
   codes cannot reach `seq.taylor@gmail.com`; the login form says the code could not be sent.
2. **Job dispatch token.** `GITHUB_DISPATCH_TOKEN` for staging: the vault PAT
   `github-cloud-1ab31c45` answered 403 on `POST /repos/seq23/sheila-creator-dashboard/dispatches`
   (fine-grained, metadata read only). Needs a fine-grained PAT with Contents: write on this
   repo: `wrangler secret put GITHUB_DISPATCH_TOKEN --env staging` (and the same for production).
3. **R2 job credentials.** `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (GitHub secrets): no R2
   S3 token is in the vault. Needs an R2 API token with Object Read & Write on both
   `sheila-creator-dashboard-files` and `-files-staging`.

### Phase 0 live checklist (staging)

Each step is something the owner does in the staging app; the last column is the automated
check that proves it.

| # | Step in the staging app | Proven by |
| --- | --- | --- |
| 1 | Log in with `seq.taylor@gmail.com` and the emailed code (needs stop 1) | `emails_sent` row `login_code` with a `provider_id`; health `Email (Resend)` green "Ready to send" |
| 2 | Connect → Buffer: paste the throwaway Buffer account's key; add TikTok, Instagram, YouTube channels in Buffer | health `Buffer` green and one green `<Platform> (via Buffer)` light per channel |
| 3 | Dump a neutral test clip from the phone (needs stops 2 + 3) | `jobs` row `type='cut'` `status='done'`; health `Clip cutting` green; clips appear in Review |
| 4 | Approve one clip, put it on the Calendar for the next hour: a real Buffer post | `posts.status='posted'` with a `url`; the post is on the throwaway accounts (then delete it there) |
| 5 | Client Brain: upload a real scanned PDF | `jobs` row `type='extract'` `status='done'`; the draft profile shows the PDF's text (OCR) |
| 6 | Connect → Instagram and YouTube sign-in (needs a Meta app with Instagram Login and a Google project "In production"; set `META_APP_ID`/`META_APP_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` with `--env staging`) | health `Instagram stats` / `YouTube stats` green; `account_stats` rows with `source='api'` |
| 7 | Stats → upload a real TikTok Studio CSV export | `platform_videos` rows `platform='tiktok'` `source='import'`; health `TikTok stats` green |
| 8 | Research → Refresh research, then Approve (needs OpenRouter connected + stops 2 + 3) | `jobs` row `type='research'` `status='done'`; `research_briefs` row `status='approved'` |
| 9 | Settings → Voice on, record a sample, narrate a clip (Chatterbox on the Actions CPU) | `jobs` row `type='voice'` `status='done'`; health `Voice` green |
| 10 | Deals → Find brands now with Firecrawl + OpenRouter connected, on real brand sites | `jobs` row `type='brand_finder'` `status='done'`; `brands` rows with a public contact; health `Brand finder` green |
| 11 | Wait for the 1st of the month (or run the daily lane): the monthly brief refresh | health `Monthly brief refresh` green "started"; `emails_sent` row `brief_ready`; the approved brief is still `approved` |

## When something is red

1. Settings → Connections + health names the light and links its fix guide.
2. `wrangler tail` for the step name (never content).
3. `jobs` table for `safe_error`; the Actions run id is in `run_id`.
4. Fix at source, add or strengthen the test that would have caught it, `land`.

## Handoff to Sheila (Phase 12)

Transfer the GitHub repo and the Cloudflare Worker/D1/R2 to her accounts; set `OWNER_EMAIL`
to hers; rotate every secret; she pastes her own vendor keys on Connections; walk every
Getting Started guide with her.
