# Runbook — sheila-creator-dashboard

## Where things are

| Thing | Where |
| --- | --- |
| Production | https://sheilastudio.seq-taylor.workers.dev, Worker `sheilastudio` (renamed from `sheila-creator-dashboard` 26 Sep 2026; Cloudflare account SL Taylor, `8d147e242033699dd37c6f5a451f48d2`) |
| Login | Production: none, `AUTH_MODE` "open" (every visitor is the owner, OWNER_EMAIL). Staging, local, e2e: the email code (`AUTH_MODE` "code") |
| D1 | `sheila-creator-dashboard-db` (id in `wrangler.jsonc`) |
| R2 | `sheila-creator-dashboard-files` |
| Repo | https://github.com/seq23/sheila-creator-dashboard (public) |
| Logs | Cloudflare dashboard → Workers → sheilastudio → Logs (observability on) |

**No login on production.** With open mode anyone who has the URL is the owner; that is by her choice; switching back is `AUTH_MODE: "code"` and a deploy. (`REQUIRED_AUTH_MODE` in
`scripts/validators/envs-match.mjs` pins each deployment's mode, so change it there too; the
deploy smoke `scripts/auth-mode-smoke.sh` then checks the new mode.) In open mode `/api/auth/*`
is a 404, `/api/me` answers as the owner with no cookie, and the Help "Log in" guide is hidden.

## Secrets

Worker (`wrangler secret put NAME`): `SESSION_SECRET`, `SECRETS_KEY` (32 bytes base64),
`JOB_SHARED_SECRET`, `GITHUB_DISPATCH_TOKEN`, `RESEND_API_KEY`.

`GITHUB_DISPATCH_TOKEN` (production and staging) is Sequoia's own GitHub token, the one the
`gh` CLI on her Mac is logged in with (account seq23, scopes `repo` + `workflow`), set with
`gh auth token | npx wrangler secret put GITHUB_DISPATCH_TOKEN [--env staging]` so it never
appears on screen. It only needs to fire `repository_dispatch` on this repo. To swap in a
narrower token at any time: github.com → Settings → Developer settings → Fine-grained tokens →
Generate; Resource owner seq23, Only select repositories → `seq23/sheila-creator-dashboard`,
Repository permissions → Contents: Read and write (Metadata: Read comes with it); copy it, run
`pbpaste | npx wrangler secret put GITHUB_DISPATCH_TOKEN` and
`pbpaste | npx wrangler secret put GITHUB_DISPATCH_TOKEN --env staging`, then press "Check
everything now" on Settings (the `Job runner (GitHub)` light) or start any job to confirm a 204.

Worker, optional (stats sign-in on Connections; without them the Instagram / YouTube buttons
stay disabled with a fix guide): `META_APP_ID`, `META_APP_SECRET` (a Meta app with Instagram
Login), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (a Google Cloud OAuth client, project "In
production", YouTube Data + Analytics APIs on). Register these redirect URIs on each app:
`<PUBLIC_BASE_URL>/api/oauth/meta/callback` and `<PUBLIC_BASE_URL>/api/oauth/google/callback`.

GitHub Actions secrets: `JOB_SHARED_SECRET` (same value), `JOB_SHARED_SECRET_STAGING`,
`OPENROUTER_API_KEY`, `FIRECRAWL_API_KEY`. No storage keys: jobs read and write files only
through the Worker that started them (`jobs/common.py` `download_input` / `upload_output` →
`GET /api/jobs/:id/input/<key>` and `/api/jobs/:id/output/{start,parts/:n,complete,abort}`,
signed with the job secret, 10 MB parts, each job type limited to its own folders by
`worker/lib/jobStorage.ts`). `npm run validate` fails if a job or workflow mentions an S3
client, an R2 credential or an S3 endpoint (`jobs-no-direct-storage`).

Per-user keys (Buffer, OpenRouter, Firecrawl, Hunter, ElevenLabs) are pasted on Settings →
Connections and stored AES-GCM encrypted in D1 `connections.secret_enc`.

## Common tasks

```bash
# query production
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT status, COUNT(*) FROM clips GROUP BY status"

# see recent jobs
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT id, type, status, safe_error, created_at FROM jobs ORDER BY created_at DESC LIMIT 10"

# tail logs
npx wrangler tail sheilastudio --format pretty

# re-run a job by hand (fake mode only, local)
curl -X POST http://localhost:8787/api/jobs/<job_id>/run-fake -H 'Cookie: ss_session=…'
```

## Cron lanes

| Cron (UTC) | Lane | Does |
| --- | --- | --- |
| `0 * * * *` | buffer-sync | loads the next 7 days into Buffer, reads back status, retries failures twice |
| `30 13 * * *` | daily | runway email, retention (raw 7 d, rejected 7 d, clip links 30 d after posting), storage light, `Voice · ElevenLabs` light (one read of her plan) |
| `0 * * * *` (same run) | brief draft notice | emails "New brief draft ready" once, when a draft newer than the approved brief lands |
| `30 13 * * *` (same run) | monthly brief refresh | on the 1st (retries the 2nd, 3rd) starts the research job for a new draft; the approved brief stays live, nothing waits for approval |
| `0 12 * * 1` | weekly | recap email, metrics + brand-finder jobs |
| `0 12 * * 1` (same run) | weekly brief adjustment | rewrites the live brief's `her_week` claims from the last 7 days, stamps `adjusted_at`; never approval, never web claims |

Each lane writes a health row `Last <lane> run`; red = the lane threw, note has the safe error.
The brief steps also write `Monthly brief refresh` / `Weekly brief adjustment` (why it ran or
did not). No fourth cron expression: the monthly refresh is a daily check that acts on the 1st.

## Voice: built-in (free) and ElevenLabs (premium)

Two engines, named the same on every screen, in `narrations.engine` and in the code
(`worker/domain/voiceEngine.ts`):

| Engine | What she sees | Where it runs | Cost |
| --- | --- | --- | --- |
| `built-in` | "Built-in voice (free): good quality, takes a few minutes per narration." | Chatterbox job on the GitHub runner (`jobs/voice.py`) | $0 |
| `elevenlabs` | "ElevenLabs premium voice: best quality, seconds per narration, uses your ElevenLabs credits." | The Worker (`worker/services/elevenlabs.ts`, `worker/lib/premiumVoice.ts`): Instant Voice Clone + text to speech (`eleven_multilingual_v2`, `mp3_44100_128`) | Her own ElevenLabs credits |

**The free voice always works without ElevenLabs.** Her consented sample always feeds the
built-in voice; the premium clone is extra.

**How Sheila connects ElevenLabs** (guide `connect-elevenlabs`): elevenlabs.io → log in → her
profile (bottom left) → **API keys** → Create API key → copy → dashboard **Settings →
Connections → Voice · premium** → paste → **Check key**. The card then shows her plan tier,
characters used of this month's limit, and whether instant voice cloning is on her plan
(Starter and above include it). A plan without cloning is accepted and says so plainly; the
built-in voice is used.

**What premium costs her:** her own ElevenLabs credits, about one credit per character of
script (a 30-second narration is roughly 400 to 500 characters). Connect shows used / limit
after each Check key and the daily lane re-reads it; the `Voice · ElevenLabs` light turns yellow
under 10% left.

Rules (unit-tested, `tests/unit/voice-engine.test.ts`):

- **Premium only when all hold:** "Use premium voice when connected" is on (setting
  `voice_engine_preference`, default `premium_when_available`), ElevenLabs is connected and
  answering, her plan allows cloning, and the clone (`voice.elevenlabs_voice_id`) exists.
  Anything else is built-in, and the Voice screen says why in one sentence.
- **Clone:** made when she saves her sample, when she connects ElevenLabs with a sample already
  saved, or before a narration if it is missing. Deleted from her ElevenLabs account on Delete
  my voice, on a new sample and on Disconnect (best effort, logged).
- **Fallback, never a stop:** 401 → connection marked broken, light red (fix
  `reconnect-elevenlabs`); 402 or `detail.status` quota_exceeded (ElevenLabs sends that as a 401)
  → light yellow "credits used up"; 429 / anything else → logged. In every case the narration is
  made by the built-in voice and the toast says so in plain words.
- The light (daily lane and Check everything now): grey not connected, green ok, yellow low
  credits (< 10% left) or no cloning on her plan, red key refused.
- Guards: validator `voice-engines` (every narration row has an engine; every ElevenLabs call
  goes through one classified `elevenFetch`); validator `voice-script` (the ~3-minute read-aloud
  script in `app/content/voice-script.md`, 400 to 520 words, a question and a number).
- Fakes (`FAKE_SERVICES=1`): keys `good-…` work (creator, cloning), `good-nocloning-…` (no
  cloning), `good-quota-…` (every character used; text to speech answers quota_exceeded);
  anything else is refused.

## Staging

The owner's fully real twin of production for testing with her own throwaway accounts;
Sheila's production is never touched by it.

| Thing | Where |
| --- | --- |
| URL | https://sheila-creator-dashboard-staging.seq-taylor.workers.dev (`/healthz` → `{"ok":true,"fake":false,"env":"staging"}`) |
| Config | `wrangler.jsonc` `env.staging`; `npm run validate:envs` fails on any drift from production except name, D1/R2 and the vars OWNER_EMAIL, PUBLIC_BASE_URL, ENV_NAME, FAKE_SERVICES, AUTH_MODE (staging keeps the email-code login) |
| D1 | `sheila-creator-dashboard-db-staging` (`c8e9e2c9-0c30-48c5-9c93-acf66a26979c`) |
| R2 | `sheila-creator-dashboard-files-staging` |
| Login | `sequoia@westpeek.ventures` (OWNER_EMAIL). The West Peek Resend key delivers only to its account owner's address, and she reads that mailbox. |
| Deploy | `npm run deploy:staging` (twin check → build → remote migrations → deploy → healthz must say `env: staging`). After every `land`, run it from `main` so both match. |

```bash
npx wrangler d1 execute sheila-creator-dashboard-db-staging --remote --env staging --command "SELECT name, light, note FROM health"
npx wrangler tail sheila-creator-dashboard-staging --format pretty
```

Secrets (`wrangler secret put <NAME> --env staging`, value on stdin): `SESSION_SECRET`,
`SECRETS_KEY`, `JOB_SHARED_SECRET` (fresh, staging-only), `RESEND_API_KEY` (the West Peek Resend
key, vault `resend-app-18f24eb6`), `GITHUB_DISPATCH_TOKEN` (see Secrets above). GitHub secret
`JOB_SHARED_SECRET_STAGING` holds the same job secret; every `job-*.yml` picks it when the
dispatch payload says `env: staging`, and the job reaches files only through the staging
Worker (`worker_url` in the payload), so it can only ever touch the staging bucket.

### What is real on staging

| Piece | State (25 Sep 2026) |
| --- | --- |
| Worker, D1, R2, crons | Real, all migrations applied |
| Buffer | Real: connected with vault `buffer-access-token` (one TikTok channel, `@iamcindymercer`; that Buffer account's Twitter channel is ignored). **That is a live TikTok account, not a throwaway**: before the Buffer post test, swap in the throwaway Buffer account on Connect (Disconnect, paste its key). |
| Email (Resend) | Real: the West Peek Resend key sends from `onboarding@resend.dev` to its own account owner, `sequoia@westpeek.ventures`, which is staging's OWNER_EMAIL. Login codes and every staging email land there. Production's OWNER_EMAIL and sender are unchanged. |
| Jobs (cut, extract, research, metrics, brand finder, voice) | Real: dispatch with `GITHUB_DISPATCH_TOKEN`; the job fetches its spec and files from the staging Worker and writes its outputs back through it (no storage keys anywhere). |
| OpenRouter, Firecrawl, Hunter, Instagram/YouTube stats | Not connected by design (Sheila's Hunter key stays hers). Connect shows "Not connected" with a guide; research and the brand finder refuse with the connect guide. The cut job falls back to its deterministic moment picker without OpenRouter. |

### Staging: named stops

None. Everything staging needs is set: email goes to the Resend owner's address, the dispatch
token is Sequoia's own GitHub token, and jobs need no storage keys.

### Staging: reading a login code without a mailbox

Resend keeps each email it sends, so an agent reads the code from Resend's API instead of an
inbox. One command asks staging for a code and prints it:

```bash
node scripts/staging-login-code.mjs --request   # {"email_id":"…","last_event":"delivered","code":"123456"}
```

What it does, step by step (the same calls by hand):

```bash
# 1. ask for a code through the real login form's endpoint
curl -s -X POST https://sheila-creator-dashboard-staging.seq-taylor.workers.dev/api/auth/request \
  -H 'content-type: application/json' -d '{"email":"sequoia@westpeek.ventures"}'
# 2. the Resend id of that email
npx wrangler d1 execute sheila-creator-dashboard-db-staging --remote --env staging --json \
  --command "SELECT provider_id FROM emails_sent WHERE kind='login_code' ORDER BY sent_at DESC LIMIT 1"
# 3. the email itself; its "text" says "Your login code is NNNNNN." and "last_event" is sent/delivered
#    (key from the vault through its Keychain adapter; a bare `security` read can pop a macOS
#    permission dialog and hang an unattended agent)
RESEND_API_KEY="$(cd ~/repo-tools/agent && python3 -c 'from repo_operator.vault import keychain as kc; print(kc.get().get("repo-operator-credential-resend-app-18f24eb6", kc.owner_account()) or "", end="")')" \
  sh -c 'curl -s https://api.resend.com/emails/<provider_id> -H "Authorization: Bearer $RESEND_API_KEY"'
# 4. trade the code for a session cookie
curl -s -c cookies.txt -X POST https://sheila-creator-dashboard-staging.seq-taylor.workers.dev/api/auth/verify \
  -H 'content-type: application/json' -d '{"email":"sequoia@westpeek.ventures","code":"NNNNNN"}'
```

### Phase 0 live checklist (staging)

Each step is something the owner does in the staging app; the last column is the automated
check that proves it.

| # | Step in the staging app | Proven by |
| --- | --- | --- |
| 1 | Log in with `sequoia@westpeek.ventures` and the emailed code (or `node scripts/staging-login-code.mjs --request`) | `emails_sent` row `login_code` with a `provider_id`; health `Email (Resend)` green "Ready to send" |
| 2 | Connect → Buffer: paste the throwaway Buffer account's key; add TikTok, Instagram, YouTube channels in Buffer | health `Buffer` green and one green `<Platform> (via Buffer)` light per channel |
| 3 | Dump a neutral test clip from the phone | `jobs` row `type='cut'` `status='done'`; health `Clip cutting` green; clips appear in Review |
| 4 | Approve one clip, put it on the Calendar for the next hour: a real Buffer post | `posts.status='posted'` with a `url`; the post is on the throwaway accounts (then delete it there) |
| 5 | Client Brain: upload a real scanned PDF | `jobs` row `type='extract'` `status='done'`; the draft profile shows the PDF's text (OCR) |
| 6 | Connect → Instagram and YouTube sign-in (needs a Meta app with Instagram Login and a Google project "In production"; set `META_APP_ID`/`META_APP_SECRET`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` with `--env staging`) | health `Instagram stats` / `YouTube stats` green; `account_stats` rows with `source='api'` |
| 7 | Stats → upload a real TikTok Studio CSV export | `platform_videos` rows `platform='tiktok'` `source='import'`; health `TikTok stats` green |
| 8 | Research → Refresh research, then Approve (needs OpenRouter connected) | `jobs` row `type='research'` `status='done'`; `research_briefs` row `status='approved'` |
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
