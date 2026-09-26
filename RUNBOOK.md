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

RESEND_API_KEY on production is Sheila's own Resend account key (vault `sheila-resend-api-key`),
never a West Peek key: without a verified domain Resend delivers only to the account owner's
address, so the West Peek key cannot reach asheilabruceaffair@gmail.com. Staging uses the West
Peek key (`resend-app-18f24eb6`) and delivers to sequoia@westpeek.ventures.

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

`YOUTUBE_API_KEY` (production and staging): the no-login YouTube numbers (see "Stats: no-login").

Worker, optional (the optional stats sign-ins on Connections and Stats, "extra detail"; without
them the buttons stay visible and the sign-in page explains it is not set up): `META_APP_ID`, `META_APP_SECRET` (a Meta app with Instagram
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
| `30 13 * * *` (same run) | daily brand refresh | a light brand-finder run (mode `daily`, 8 searches, one source group per day) unless one ran in the last 20 hours; health row `Daily brand refresh` |
| `0 12 * * 1` (same run) | weekly brief adjustment | rewrites the live brief's `her_week` claims from the last 7 days, stamps `adjusted_at`; never approval, never web claims |

Each lane writes a health row `Last <lane> run`; red = the lane threw, note has the safe error.
The brief steps also write `Monthly brief refresh` / `Weekly brief adjustment` (why it ran or
did not). No fourth cron expression: the monthly refresh is a daily check that acts on the 1st.

## Voice overs: built-in (free) and ElevenLabs (premium)

**Nothing hidden, nothing switched off** (owner, 26 Sep 2026). The Voice overs screen (route
`/voice`) is always in the menu, Home has a quiet "Your voice overs" card (not set up / built-in
ready / premium on / a real error with its fix link), and every Settings → Features switch is
on by default (migration `0010_features_on.sql`, `DEFAULT_FEATURES` in `shared/constants.ts`,
validator `nothing-hidden`). `features.voice` is the switch "Voice overs on clips" (on the Voice
overs screen and in Settings): off = clips stay real footage with no voice over; her voice can
still be recorded and saved.

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
Connections → Voice overs · premium** → paste → **Check key**. The card then shows her plan tier,
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

## Looks: variety from the built-in editor

The owner's ask (25 Sep 2026): clips need variety, layouts and "bells and whistles", with no paid
service. Every clip is rendered in a **Look**, a named preset of the built-in editor's options
(ffmpeg + libass + MediaPipe, `jobs/looks.py`). `jobs/looks.json` is the source of truth;
`worker/domain/looks.ts` mirrors it (`tests/unit/looks.test.ts` fails if they differ).

| Look | What it is |
| --- | --- |
| Clean | Face-follow full frame, plain white captions at the bottom, end card |
| Bold hook | Big hook at the top for 2.5 s, word-by-word highlight at the bottom, punch-in on sentence starts |
| Karaoke captions | Centred captions, the spoken word lights up, punch-in, progress bar |
| Brand card | Captions on a brand-coloured box, brand-coloured progress bar, end card |
| Cinematic | Whole frame over a blurred copy (landscape keeps everything), warm grade, crossfades, fade in |
| Reaction inset | Full frame plus the strongest line replaying in a small inset |
| Split moment | Two moments stacked (grid, 2 cells) |
| Side by side | Two moments left and right (grid, 2 cells) |
| Grid of four / six / eight | 2x2, 2x3, 2x4 grids of the dump's moments |
| Hero and strip | One big moment, three small underneath |

- **Rotation:** the Worker sends `rotation` (`rotationFor`: her enabled Looks shuffled per dump,
  singles and grids two to one, every Look before a repeat) and each Look resolved with her
  Settings > Editing switches; clip k takes `rotation[k % n]` and comes back with `look`,
  `parts` and (grids) `layout` (clips columns, migration 0008).
- **Grids:** cells come from the dump's other moments (same length, their own face-follow
  crop), then this moment closer (1.35x / 1.7x / 2.1x). The cell with the clearest speech is the
  voice (its sound plays, its words are the captions); she can change every cell and the voice in
  Review. Low-resolution cells are upscaled with lanczos and a light sharpen, never stretched.
- **Change look (Review):** `POST /api/clips/:id/look` sets `pending_look` and dispatches a
  `cut` job with ref `<dumpId>/<clipId>`; the job renders `<clip>-v<n+1>.mp4`, the Worker swaps
  it in (`media_version` bumps, `?v=` busts the cache) and deletes the old file. The old version
  plays until then. Refused plainly when the clip is in Buffer, already re-rendering, or its raw
  upload was cleared (7 days).
- **Settings > Editing:** Looks in the mix (all on; stored as `looks_off` so a new Look starts
  on), captions, end card (logo `public/assets/brand/sheila-logo.png` + her TikTok handle from
  Buffer, else Brand Profile), music bed. **Music is only her own uploads** (My music, R2
  `music/`, table `music_tracks`): no bundled music or libraries, because a song she does not hold
  the rights to can get a post muted or removed. The bed switches on with her first song and off
  when the last one is removed.
- **Brand colours / font:** the first two `#rrggbb` codes in her Brand Profile are the primary and
  accent colours; a font it names from `BRAND_FONTS` is fetched from Google Fonts' repo at render
  time (default DejaVu Sans when absent or unreachable).
- **Proof:** `python3 jobs/selftest_cut.py` renders every Look on synthetic footage (the
  `selftest-looks` job on every PR touching the pipeline, singles and grids in two parallel halves;
  the heavy `selftest` job runs the dumps with `--skip-looks`) and checks 1080x1920, duration, captions and
  hook burned where the Look says (pixel diff against the same render with text off), the end
  card, grid gutters and cells from sampled pixels, and that every two Looks differ by difference
  hash (floor 0.02 of the bits in some frame). `--looks-only` runs just that; `--write-thumbs`
  refreshes the previews in `public/looks/` (needs an ffmpeg with libass and libwebp, e.g.
  Homebrew `ffmpeg-full`). Validator `looks` (`npm run validate:looks`): every Look has a
  description, a WebP preview, the mirror entry, unit coverage, and each grid a picture in the
  `grid-looks` guide.

## Editors: CapCut hand-back and connected editors

The research and the decisions are in `docs/EDITORS.md` (checked 25 Sep 2026). The built-in editor
is the default and the fallback for every job; nothing waits on another editor.

- **CapCut / InShot / any app (no API):** Review → **Edit in CapCut** → share or save the clip
  (`/media/<token>?download=1`), edit, **Replace with my edit** (upload kind `edit`, R2
  `edits/<clip>/`). `POST /api/clips/:id/replace` reads the MP4/MOV header in the Worker
  (`worker/lib/mp4.ts`) and refuses a non-9:16 or too-long edit in words (`checkEdit`: TikTok
  10 min, Instagram 90 s, YouTube Shorts 3 min, at least 3 s). Then the cut job's **import mode**
  (ref `<dump>/<clip>/import`) measures it again, fits it to 1080x1920, levels loudness, makes the
  cover; the Worker swaps it in (`edited_with`, `media_version`), re-mixes an attached voice over.
- **Connected editors (her own key, Connect → Editing apps):** Opus Clip, Vizard, Klap
  (`cut_from_source`), Submagic (`caption`, `enhance`), Descript (`enhance`). Settings → Editing →
  **Who edits** picks one per job (stored in the `editing` setting's `editors`); a pick that is not
  connected falls back to built-in. `worker/lib/editorJobs.ts`: a dump's videos go to the editor
  by `/media/source/<token>` (valid while the job waits, max 6 h), rows in `editor_jobs`; Dump and
  Review poll while open, the hourly lane polls the rest; a finished job dispatches the import
  (`<dump>/import` → clips through `parseCutResult`, only the planned ids). A captions editor makes
  the built-in render leave words off; if it fails, the clip is re-rendered with built-in captions.
- **Failures fall back, never stop:** refused key → connection error + red light
  (`reconnect-<editor>`); out of credits → yellow; editor failed or over 3 h → yellow; in every
  case the built-in editor does the job. Each light is the editor's own health row.
- **Credits:** shown on the card when the editor's API reports them; none of the five documents
  it today, so the card says where to see them. **Proof:** fakes only (`FAKE_SERVICES=1`: keys
  `good-…` work, `good-low-…` low credits, `good-fail-…` the editor fails, `good-credits-…` out of
  credits); no real key exists in the vault, so every real client is not yet proven.

## Brand deals and the media kit

How it works, where the rules live, and what to check (review: `docs/reviews/2026-09-25-mediakit-deals.md`;
the talent-manager view: `docs/reviews/agency-pov.md`).

| Thing | Where |
| --- | --- |
| Pipeline stages, next action, follow-ups (day 5, 12, 19, then stop), money strip | `worker/domain/deals.ts` |
| Email scenarios (18), starter drafts, the AI check (no invented dollar figures, kit link kept) | `worker/domain/emails.ts`, `shared/emailcheck.ts` |
| Inbound offers: terms, red flags, verdict | `worker/domain/offers.ts` |
| Rate helper, benchmarks with sources, add-ons, counters, lever scripts | `worker/domain/ratecard.ts` |
| Prospect ranking (budget signal × fit × reachability) | `worker/domain/prospects.ts` |
| Marketplaces ("Get listed here"), must match `docs/BRAND-SOURCES.md` | `worker/domain/marketplaces.ts` |
| Kit content, public view (private rates stripped), Kit check | `worker/domain/kit.ts` |
| QR code | `worker/domain/qr.ts` |
| Web search + reading for jobs (Firecrawl optional) | `jobs/common.py` `Web` |

- **The public kit is the newest published version** (`media_kit_versions`); her edits are a draft
  (`media_kit.draft`) until she taps Publish. Old link names live in `kit_slugs` and forward.
  Views: `kit_views` (no IP or user agent stored; her Preview and link-preview bots are not counted).
- **Figures are live from Stats** with their as-of date and source; a figure older than 30 days
  shows in the Kit check with a one-tap refresh. Numbers she types are marked self-reported.
- **Benchmarks** (checked 25 Sep 2026): Later's 2026 pricing guide (nano and micro ranges), Collabstr's
  2026 report (average paid by platform), impact.com and Later on usage and exclusivity, Digiday on
  payment terms, Socialinsider on TikTok engagement. Re-check them yearly: update `SOURCES` and the
  ranges in `ratecard.ts`; the unit tests pin the dates.
- **Web research needs no key.** Without Firecrawl, jobs search DuckDuckGo's HTML page and read pages
  through the Jina reader (`r.jina.ai`, about 20 a minute, no key); Jina's search needs a key
  (401 without one, checked 25 Sep 2026) and is used only if `JINA_API_KEY` is set on the runner.
  A Firecrawl key that is refused or out of credits falls back to the free path and turns the
  `Brand finder` light yellow with the reason.

```bash
# the pipeline at a glance
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT stage, COUNT(*) FROM deals GROUP BY stage"
# kit versions and views
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT version, published_at FROM media_kit_versions ORDER BY version DESC LIMIT 5; SELECT COUNT(*) FROM kit_views"
```

## Steering a dump: Surprise me, chips and notes

The owner (26 Sep 2026): "some degree of on-demand control is good and maybe a surprise-me aspect
can be good too". The review behind it: `docs/CREATIVE-CONTROL-REVIEW.md`.

- **Which videos:** two cards on Dump ("New videos I just filmed" / "Old posts to reuse"),
  nothing preselected, a `?` bubble on each; the Dump button repeats her choice ("Dump 3 new
  videos"). The words "door A/B" never appear in the app.
- **Surprise me** (default): the built-in variety (Settings > Editing), and the dump says
  **What we tried** (`dumps.tried`).
- **Chips** (`dumps.steer`, shared/steer.ts): Look (incl. every grid), Music (none / my songs /
  one song), Pace, Clip length, How many, Captions, Platforms. Untapped = surprise for that one.
- **Notes** (the dump's and each video's) are read into the same controls plus must include /
  leave out: rules always (`worker/domain/steer.ts parseNotes`, fixtures in
  `tests/unit/fixtures/steer-notes.json`), and the free AI through the Worker's one OpenRouter
  client when it is connected (`worker/lib/steerStore.ts`). "Here's what we understood" shows
  before Dump; the confirmed reading is stored (`dumps.steer_notes`, `assets.steer_notes`).
  Precedence per control: a video's note > a chip > the dump's note > surprise.
- **Never silently dropped:** anything not possible as asked (a 3x3 grid, a song not uploaded,
  40 clips, a phrase never said) is still made the closest way and listed on the dump
  (`dumps.not_followed`): the parse's list, chip/note clashes, and the cut job's `steer_report`.
- **The cut job honors it** (`jobs/cut.py`): rotation and looks from the chosen looks, captions
  and pace on each look, her song or none, recipe bounds from the length, the count (moments she
  asked to include kept first), platforms, leave-out moments dropped and must-include moments
  added from the transcript. Proven by `tests/unit/steer.test.ts` (spec on the real schema) and
  `jobs/selftest_cut.py check_steer` (rendered: only 2x4 grids and no song after "2x4 grid, no
  music, fast"; exactly 2 short clips with her song). Validator `steer-honored` fails when any
  control loses a link of that chain.
- **Review:** Change look, **Change music** (`POST /api/clips/:id/music`, `clips.pending_music`),
  **Try another version** (`POST /api/clips/:id/another`: a different look from her mix).

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
| Buffer | Real: the owner's test Buffer account (seq.taylor@gmail.com, free plan, 3 of 3 channels): TikTok `@iamcindymercer`, Instagram `seq23`, YouTube "Sequoia Taylor". All three are her **test channels** (her word, 25 Sep 2026); the Phase 0 TEST POST goes to all three. Key: vault `buffer-access-token`, created 25 Sep 2026, **expires 25 Sep 2027** (Buffer → Settings → API; the free plan allows ONE key per account, so this key is shared with `authority-backlink-network`'s `BUFFER_ACCESS_TOKEN` secret; renewing it means Regenerate there, then `vault set buffer-access-token --from-file`, `gh secret set BUFFER_ACCESS_TOKEN -R seq23/authority-backlink-network`, and paste on staging's Connect). The account's 3,000 requests / 30 days are shared too; the dashboard's own idle spend is 20 a day (`tests/unit/buffer-budget.test.ts`). |
| Email (Resend) | Real: the West Peek Resend key sends from `onboarding@resend.dev` to its own account owner, `sequoia@westpeek.ventures`, which is staging's OWNER_EMAIL. Login codes and every staging email land there. Production's OWNER_EMAIL and sender are unchanged. |
| Jobs (cut, extract, research, metrics, brand finder, voice) | Real: dispatch with `GITHUB_DISPATCH_TOKEN`; the job fetches its spec and files from the staging Worker and writes its outputs back through it (no storage keys anywhere). |
| YouTube stats | Real, no sign-in: `YOUTUBE_API_KEY` set; channel from Buffer's serviceId (see "Stats: no-login"). A Google sign-in is also connected on staging (optional extra detail). |
| Instagram stats | The form path (public profile login-walled from the Worker); a Meta app is not set up (optional) |
| OpenRouter, Firecrawl, Hunter | Not connected by design (Sheila's Hunter key stays hers). Connect shows "Not connected" with a guide; research and the brand finder refuse with the connect guide. The cut job falls back to its deterministic moment picker without OpenRouter. |

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
| 6 | Stats → Update numbers (no sign-in); type the Instagram numbers in "Your Instagram numbers". Optional extra: the Google / Instagram sign-ins | `settings.youtube_public.state='ok'`, `account_stats` youtube `source='api'`; instagram `source='manual'`; health `YouTube stats` / `Instagram stats` green |
| 7 | Stats → upload the TikTok Studio export as downloaded (the zip) | `platform_videos` rows `platform='tiktok'` `source='import'` with post times; health `TikTok stats` green |
| 8 | Research → Refresh research, then Approve (needs OpenRouter connected) | `jobs` row `type='research'` `status='done'`; `research_briefs` row `status='approved'` |
| 9 | Settings → Voice on, record a sample, narrate a clip (Chatterbox on the Actions CPU) | `jobs` row `type='voice'` `status='done'`; health `Voice` green |
| 10 | Deals → Find brands now with Firecrawl + OpenRouter connected, on real brand sites | `jobs` row `type='brand_finder'` `status='done'`; `brands` rows with a public contact; health `Brand finder` green |
| 11 | Wait for the 1st of the month (or run the daily lane): the monthly brief refresh | health `Monthly brief refresh` green "started"; `emails_sent` row `brief_ready`; the approved brief is still `approved` |

## Stats: no-login

Owner decision (25 Sep 2026, 20:40 CT): production Stats never needs a login. Sheila never sees a
Google or Meta consent screen (Google OAuth in Testing shows "unverified app" and drops after 7
days; Instagram Login needs Meta App Review). The Google / Instagram sign-ins stay visible on
Stats and Connections, labelled optional extra detail with the sentence that Google or Meta may
show a warning until the app is approved; nothing is gated behind them. Code:
`worker/lib/publicStats.ts`, `worker/services/youtube.ts`, `worker/services/instagramPublic.ts`,
`worker/lib/unzip.ts`; guards: `tests/unit/stats-no-login.test.ts`, validator `stats-no-login`.

**Which path is active (measured on staging 25 Sep 2026):**

| Platform | Active path | Why |
| --- | --- | --- |
| YouTube | Public numbers with `YOUTUBE_API_KEY` (Data API v3: channels, playlistItems, videos; 3 to 5 quota units a run) | Public data needs no sign-in. Channel = Buffer's YouTube `serviceId` (the UC… id), or what she types on Stats ("Your YouTube channel"). Staging read `UC7O1lQikHSc77s7gNnj9htQ` (Sequoia Taylor): 1 subscriber, 0 views, 0 videos. |
| Instagram | **The form** ("Your Instagram numbers" on Stats: followers + average reach or views, 3-step guide, "Remind me monthly") | From the Worker, the keyless profile JSON answers 401 and the profile page 302 → login (handle seq23). The public read still runs at most once a day and switches itself on if Instagram ever answers. |
| TikTok | The TikTok Studio export upload | Unchanged; the zip TikTok hands her is read (below). |

The active path is stored in D1 settings (`youtube_public.state`, `instagram_public.path` =
`public` / `manual` / `oauth`) and logged as `stats.youtube.path` / `stats.instagram.path`:

```bash
npx wrangler d1 execute sheila-creator-dashboard-db --remote --command "SELECT key, value FROM settings WHERE key IN ('youtube_public','youtube_channel','instagram_public','instagram_manual','instagram_reminder')"
```

When it runs: every "Update numbers" (never refused for a missing sign-in), the daily lane
(YouTube; Instagram at most once a day) and the Monday lane. The metrics job (the sign-in path)
is dispatched only when a Google / Instagram sign-in is connected. With a Google sign-in
connected, that sign-in owns the `YouTube stats` light; the public numbers still land.
"Remind me monthly" adds one line to the Monday recap once her typed numbers are 30+ days old
(at most every 4 weeks); it rides the recap, so it needs "Weekly recap" on (the default).

**Rotate `YOUTUBE_API_KEY`** (Google Cloud project `sheilastudio-staging-p0`, account
seq.taylor@gmail.com; key "Sheila Studio YouTube public stats", API-restricted to
`youtube.googleapis.com`). Create the new one, put it everywhere, then delete the old one:

```bash
S=$(mktemp) && chmod 600 "$S"
N=$(gcloud --account seq.taylor@gmail.com services api-keys create --project sheilastudio-staging-p0 \
  --display-name "Sheila Studio YouTube public stats" --api-target=service=youtube.googleapis.com \
  --format='value(response.name)')
gcloud --account seq.taylor@gmail.com services api-keys get-key-string "$N" --format='value(keyString)' | tr -d '\n' > "$S"
npx wrangler secret put YOUTUBE_API_KEY < "$S"                 # production (sheilastudio)
npx wrangler secret put YOUTUBE_API_KEY --env staging < "$S"
(cd ~/repo-tools/agent && python3 -m repo_operator.cli vault set sheila-youtube-api-key --class APPLICATION_SECRET --provider google --from-file "$S")
rm -P "$S"
# press Update numbers on Stats (YouTube card: "Public numbers, no sign-in"), then delete the old key:
gcloud --account seq.taylor@gmail.com services api-keys list --project sheilastudio-staging-p0
gcloud --account seq.taylor@gmail.com services api-keys delete <old key name> --project sheilastudio-staging-p0
```

A refused key shows `YouTube stats` yellow "YouTube refused this dashboard's key" (guide
`your-youtube-numbers`); a missing key shows "not set up on this dashboard yet". Quota answers
wait until the next day. `gcloud` on this Mac defaults to another account: always pass
`--account seq.taylor@gmail.com`.

**TikTok zip:** TikTok Studio's "Download data → CSV" hands her a zip (e.g.
`Content_<handle>.zip` holding `Content.csv`, header `"Time","Video title","Video link","Post
time","Total likes","Total comments","Total shares","Total views"`). The Worker opens it
(`worker/lib/unzip.ts`, stored or deflate via `DecompressionStream`) and reads the CSV inside; she
may upload the zip or the CSV. Only a real Excel workbook (a zip with `[Content_Types].xml`) gets
"That is an Excel file". "Post time" in that export has no year ("September 4"), so the post
time comes from the TikTok video id (its top 32 bits are the Unix seconds it was posted).
Proven on staging 25 Sep 2026: the real zip imported 5 videos with exact post times.

## When something is red

1. Settings → Connections + health names the light and links its fix guide.
2. `wrangler tail` for the step name (never content).
3. `jobs` table for `safe_error`; the Actions run id is in `run_id`.
4. Fix at source, add or strengthen the test that would have caught it, `land`.

## Handoff to Sheila (Phase 12)

Transfer the GitHub repo and the Cloudflare Worker/D1/R2 to her accounts; set `OWNER_EMAIL`
to hers; rotate every secret; she pastes her own vendor keys on Connections; walk every
Getting Started guide with her.
