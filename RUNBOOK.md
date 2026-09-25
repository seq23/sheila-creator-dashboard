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
| `0 12 * * 1` | weekly | recap email, metrics + brand-finder jobs |

Each lane writes a health row `Last <lane> run`; red = the lane threw, note has the safe error.

## When something is red

1. Settings → Connections + health names the light and links its fix guide.
2. `wrangler tail` for the step name (never content).
3. `jobs` table for `safe_error`; the Actions run id is in `run_id`.
4. Fix at source, add or strengthen the test that would have caught it, `land`.

## Handoff to Sheila (Phase 12)

Transfer the GitHub repo and the Cloudflare Worker/D1/R2 to her accounts; set `OWNER_EMAIL`
to hers; rotate every secret; she pastes her own vendor keys on Connections; walk every
Getting Started guide with her.
