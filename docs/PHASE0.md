# Phase 0 live test — staging, 25–26 Sep 2026

The dashboard run for real on staging (`FAKE_SERVICES=0`) with the owner's test accounts: the
Buffer account seq.taylor@gmail.com (TikTok `@iamcindymercer`, Instagram `seq23`, YouTube
"Sequoia Taylor"; all three are her test channels), the West Peek Resend key, the owner's
OpenRouter key, the Google account that owns the YouTube channel.

Suite: `tests/live/*.spec.ts`, `npm run e2e:live` (`playwright.live.config.ts`, `LIVE_BASE_URL`,
refuses anything but staging/local). Login reads the emailed code back from Resend; one session
is kept in `.live-auth/` for every run. Evidence: `docs/design/live/*.jpg` (each under 300 KB)
and `docs/design/live/evidence.json` (ids, run ids, counts; never content).

| # | Item | Result | Evidence | Fix PR |
| --- | --- | --- | --- | --- |
| 1 | Login with the real emailed code, Home as owner | PASS | Resend email `01a0db53-ab36-7557-bfd8-623e85968807` (delivered); `01-home.jpg` | — |
| 2 | Buffer connected with the throwaway key, 3 channels green | PASS | org `6a1331f15351f4a7ea38e3d5`, TikTok/Instagram/YouTube `posting OK`; `02-buffer-channels.jpg`. Key rotated 25 Sep, expires 25 Sep 2027 (RUNBOOK) | #16 (a dead key could not be disconnected) |
| 3 | Client Brain: 2-page PDF + scanned page → extract on Actions (OCR) → draft → lock | FIXED | run 36206328926; PDF 2,029 chars, OCR 2nd file 1,165 chars; profile v2 locked; `03-brain-*.jpg` | #18 (free model answers cut off for length) |
| 4 | Research: OpenRouter connected, research job, labelled brief, web search off, approve | PASS | run 36206497265; 57 claims (her data 32, web 22, uncertain 3), "Web search was skipped…" shown; brief v2 approved; `04-*.jpg` | #20 (header's uncertain count) |
| 5 | Dump → cut on Actions → clips + "clips ready" email → playable in Review | PASS | owner video 245 s 320×568: run 36206701421, 28 clips at 1080×1920, email `01a0db40-…`; synthetic TEST clip: run 36208674291, 5 clips, email `01a0db58-…` | #20 (someone else's video) |
| 5b | Another creator's TikTok is held off the calendar | FIXED | run 36208158574, asset `source_owner=other`, note on Dump, not in the pool; `05-dump-held.jpg` | #20 |
| 6 | Review: approve, reject with a reason, caption, hook swap, untick a platform, #ad once | PASS | `06-review-*.jpg`; `#ad` exactly once after two saves | — |
| 7 | Calendar: Fill (caps), move, take off; hourly lane → Buffer; REAL posts | FIXED | Fill 15 posts within caps, move + take off on screen; the hourly lane loaded Buffer; Buffer `sent` and the dashboard shows Posted with links after the next run: TikTok https://tiktok.com/@iamcindymercer/video/7689660837077847309 · Instagram https://www.instagram.com/reel/DdvCgMMFRhk/ · YouTube https://www.youtube.com/shorts/lFDhkdWMj0w ; `07-*.jpg` | #23 (Instagram/YouTube metadata, error read-back), batch 5 (desktop week unreadable) |
| 8 | Health: broken Buffer key → red + one "Buffer needs you" email; reconnect → green; Check everything now | FIXED | email `01a0db0c-36cd-76c9-a918-20be142def33` (exactly 1); `08-buffer-red.jpg`, `08-health-green.jpg` | #16, #17 (sidebar said "All systems OK" beside a red light) |
| 9 | Stats: Google sign-in + Sync; TikTok Studio export | PASS (Instagram not tested) | YouTube: metrics run 36210125799, channel 1 subscriber / 0 videos at sync time, light green; TikTok CSV: 5 videos (views 7,016 / 68 / 56 / 35 / 26), light green. Instagram sign-in not tested: being replaced (owner decision) | — |
| 10 | Deals | NOT RUN YET | runs after the Media kit + Deals overhaul lands (owner's sibling work in progress); the weekly lane's brand-finder job ran green live (run 36217061774) | — |
| 11 | Media kit | NOT RUN YET | runs after the Media kit + Deals overhaul lands | — |
| 12 | Voice (built-in) | FIXED | voice run 36213784217 (4.4 min), 9.1 s narration, audio 200 `audio/mpeg`, attached to a clip, Delete my voice clears sample + model; `12-voice-*.jpg` | #23 (Chatterbox TypeError: setuptools<81) |
| 13 | Help: search, guide, feedback, tour; screenshot job PR | FIXED | `13-help-*.jpg`, feedback row stored; job PR #21 had no checks and pictured an empty Calendar | batch 5 |
| 14 | Crons | PASS | Hourly lane green every hour live (`Last buffer-sync run` 01:00–04:01 UTC). Daily + weekly lanes run through the real `runCron` against staging's bindings and secrets (a `wrangler dev --remote --env staging` preview; a deployed cron cannot be fired from the CLI): `Last daily run` / `Last weekly run` green, emails `time_to_dump` `01a0dbe8-a41e-…` and `weekly_recap` `01a0dbe8-b670-…`, metrics run 36217061003 + brand-finder run 36217061774 done, `Weekly brief adjustment` green (brief v2 `adjusted_at` set), `Monthly brief refresh` "Next refresh on Oct 1". All three cron expressions registered on staging (deploy output). The deployed daily/weekly firing: first live run 13:30 UTC today / Mon 28 Sep 12:00 UTC | — |
| 15 | Clean-up | PARTLY DONE | Scheduled test posts removed 2026-09-26 04:26 UTC: all 12 future TEST posts (TikTok ×4, Instagram ×4, YouTube ×4, 28 Sep–2 Oct; not only the 3 TikTok ones, because Instagram and YouTube also loaded after #23) taken off through the Calendar's take-off route; Buffer read-back: 12 of 12 gone. The 3 published TEST posts stay up. The rest (clips, docs, voice overs; `tests/live/15-cleanup.spec.ts`) runs after items 10–11 | — |

## Bugs found and fixed at source

Each has a guard that was proven to fail without its fix.

1. Connect: a stored key Buffer stopped accepting had no Disconnect (#16).
2. "Check everything now" left the sidebar on "All systems OK" beside a red light (#16, #17).
3. Two lights for one thing: "Cutting" and "Clip cutting" (#16).
4. The hourly lane's `buffer_requests` log undercounted (#16). Budget measured: 20 requests on
   an idle day against 25 (`tests/unit/buffer-budget.test.ts`).
5. Free-model answers cut off for length (reasoning models spend max_tokens): brand profile
   draft failed, pitches always fell back; one OpenRouter client for jobs (#18).
6. Research header's uncertain count left out the "How often" rows (#20).
7. Someone else's video (burned-in TikTok watermark) went through to the calendar: OCR
   watermark check, held until "This is my video" (#20).
8. Buffer refused every Instagram post (no `type`) and every YouTube post (no title/category) (#23).
9. Buffer read-back selected `error` bare (an object): no post could ever be marked Posted (#23).
10. Voice job always failed (`TypeError`, resemble-perth needs pkg_resources) (#23).
11. Calendar desktop week: hooks wrapped one letter per line at 1280 px (batch 5).
12. Workflow-opened PRs (help screenshots) got no checks, so they could never be landed; the
    Calendar guide pictures showed an empty week (batch 5).
