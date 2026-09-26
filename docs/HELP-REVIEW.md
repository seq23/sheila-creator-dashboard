# Help centre: hostile review and overhaul (26 Sep 2026)

Owner, 26 Sep 2026: "the help section has the same screenshot — it needs an overhaul too with
fresh screenshots and an overhaul of what features it's showing."

Read against `main` at c26dd90 (after #34, editors / CapCut hand-back), then rebased on 9bef7f3 (#40, steering a dump) and its two features added. Production has no login
(`AUTH_MODE` open), every Settings feature switch is on by default, Stats needs no sign-in.

## Before (measured)

| | Count |
| --- | --- |
| Guides | 63 |
| Screenshot files | 560 |
| Unique images (sha256) | 260: 300 files were copies of another guide's picture |
| Largest identical groups | 20 files each: step 2 / step 3 / step 4 of 20 different Connect and Reconnect guides, desktop and phone |
| Steps on another site (Buffer, TikTok Studio, the Instagram app, ElevenLabs…) with a picture of that site | 0 |
| Of Sheila's questions ("how do I post", "why is my light red", "how do I get paid by brands", "how much should I charge", "find sponsors") answered by search | 1 of 5 answered usefully: three found nothing, "how do I post" listed 5 unrelated guides (measured with the old every-word rule on the old files) |

### Root cause of the identical pictures (CONFIRMED)

`tests/e2e/help-screenshots.spec.ts` opened each step's `route` (default: the guide's `screen`)
and circled the step's `target`; **when a step had no target, or the target was not visible, it
circled the page heading instead** (`findTarget` fell back to `main h1`). 24 guides had no
per-step directives at all and their `screen` was `connect`, so every one of their steps was the
Connect screen with the heading circled, and the only difference between two guides' step *n* was
nothing: the number in the circle is *n* for both. Steps marked `route: external` (another site)
were skipped and never pictured. Nothing checked that a picture showed its step or differed from
another step's.

Fixed at source:

- **No fallback.** A step's click or target that is not on screen fails the run (in report mode,
  `HELP_REPORT=file`, it is listed instead so one run shows every problem while writing guides).
- **Every step is pictured.** A step on another site or app is a **mock** frame
  (`tests/e2e/help-mocks.ts`): a plain sketch in the app's own tokens with a banner "Illustration
  of Buffer: what you'll see there, not a real account". Never a screenshot of a real account or
  anyone's personal data.
- **Each step in its own state.** Steps can set the state they describe through the app's own
  routes (`api:` a refused key, a picked editor), a health light (`light:`), a typed field
  (`fill:`) and several clicks. The base state is a realistic demo (`seed-help-extra.sql`,
  `seed-help-lights.sql`): new clips in six different Looks with covers, a held video, results on
  Stats, a saved voice with a premium and a built-in voice over, deals at every stage from pitch to
  paid with an inbound offer read by the real offer reader, today's posts (posted, failed, in
  Buffer, planned), connected Buffer / OpenRouter / ElevenLabs, one red and one yellow light.
- **Duplicates are refused** by the job (per run) and by the validator `help-pictures` (committed
  files), unless both steps say `<!-- shared -->` (none do).
- The OpenRouter fake accepted every key, so a refused AI key could not be shown or tested; it
  now refuses keys starting "bad", like the Firecrawl and Hunter fakes (unit test).

## Guide by guide (old set)

Verdict key: **stale** = describes a screen that changed; **wrong** = says something untrue now;
**pictures** = pictures did not show the step; **removed thing** = about something production no
longer has or never needs.

| Guide | Verdict | What was wrong | Now |
| --- | --- | --- | --- |
| getting-started | stale, pictures | Seven steps, one picture each of the Help page heading; no Stats, Voice overs, Deals or Media kit | 8 steps, one per screen, each on that screen |
| log-in | removed thing | First item of Getting started though production has no login | "Log in (test copy only)", says your dashboard opens straight to Home; hidden in open mode as before |
| connect-buffer, reconnect-buffer, add-channels-in-buffer, reconnect-an-account | pictures | Buffer's own steps pictured as the Connect heading | Mock frames of each Buffer step; the dashboard steps show the empty, refused and connected card |
| connect-openrouter, reconnect-openrouter | pictures | Same | Mocks; refused-key card (fake fixed) |
| connect-firecrawl | wrong, pictures | "Your next Refresh research searches the web too": research already searches the web with no key | Says it is optional and only faster; free search is the fallback |
| reconnect-firecrawl, connect-hunter, reconnect-hunter | pictures | Same identical Connect pictures | Mocks + real card states |
| connect-elevenlabs, reconnect-elevenlabs | pictures | ElevenLabs steps unpictured | Mocks; plan and credits card |
| connect-opusclip / vizard / klap / submagic / descript and their reconnects | pictures | External steps unpictured; "Pick it under Who edits" pictured the Editing section for all five | Each editor's own card, then its own pick in Settings > Editing |
| connect-an-editor | ok, thin | | Shows Editing apps and the three "who does what" picks |
| connect-stats | wrong framing | Title "Connect your stats" implied a sign-in | "Your numbers: no sign-in needed" |
| connect-meta, connect-google | removed thing framing | "Connect Instagram stats / YouTube stats" in Getting started as if needed | "(optional extra detail)"; says you never need it and the warning page is expected |
| reconnect-meta, reconnect-google, reconnect-tiktok | stale | "Under Stats · for research … tap Reconnect": that section and button no longer exist | Current "Connect with Instagram/Google" buttons; TikTok: upload a fresh export |
| connect-tiktok | stale | Same section name | Current "Upload TikTok export" row |
| connect-resend, reconnect-resend, connect-github, reconnect-github | pictures | Helper tasks pictured as Connect heading | Mocks of the helper's step; the light on Settings |
| upload-brand-docs, approve-research-brief | pictures | Screen heading only | Each step's own control |
| dump-new-footage, recycle-old-videos | pictures | Heading only | Doors, Choose videos, notes, Dump, Recent dumps |
| review-and-approve-clips, edit-a-caption, mark-a-paid-partnership | pictures | Heading only; black video frames | Real clip cards with covers; the edit dialog fields |
| looks-and-styles, grid-looks, edit-in-capcut | ok | Had targets; pictures partly right | Kept, with Look covers, the grid cell picker and CapCut mocks |
| move-or-remove-a-post, a-post-failed | pictures | Heading only | Today's posts; the post dialog's Move / Swap / Try again / Take off |
| what-runway-means | stale | "Email me when runway is under" is now the ± weeks control; Home has more cards | "Your Home screen and what runway means" |
| change-posts-per-week | ok | Heading only | ± buttons, the weekly limit |
| record-your-voice | wrong | "only your own login can record your voice": production has no login | Rewritten; making voice overs moved to its own guide |
| media-kit, pitch-a-brand, reply-to-a-brand-offer, negotiate-a-rate, invoice-a-brand | ok, thin pictures | Several steps fell back (selectors that did not exist) | Real deal states (pitch, follow-up, negotiating with an offer, delivering, invoiced) |
| storage-almost-full, i-didnt-get-an-email, clips-look-wrong, someone-elses-video | pictures | Heading only | The Storage light, spam mock, the held-video note and "This is my video" |
| upload-your-tiktok-export, update-instagram-numbers, your-youtube-numbers | pictures | External steps unpictured | TikTok Studio / Instagram app / YouTube mocks + the Stats form |

### Missing (features with no guide)

| New guide | Why she needs it |
| --- | --- |
| how-posting-works | "How do I post?": approve, Calendar fills, Buffer publishes, posted with a link |
| health-lights | "Why is my light red?": the colours, How to fix, Check everything now |
| make-a-voice-over | Which voice, the switch, Draft with AI, Premium / Built-in tags, attach to a clip |
| read-your-stats | Top clips, best times, posting times, best cut styles |
| settings-and-switches | Every feature switch is on by default; what off means |
| set-your-rates | "How much should I charge?": packages, Suggest prices, floor, add-ons |
| find-brands | The brand finder, How it ranked, Find brands now, Add a brand I love (no key needed) |
| deal-stages | Money strip, Do this next, the next step card, moving a deal |
| deal-memo | What you agreed, Edit the terms, the contract checklist |
| get-listed | The creator marketplaces |
| steer-a-dump | Surprise me or steer: chips, the note, "Here's what we understood" (#40) |
| try-another-version | Try another version and Change music on a clip (#40) |

## After

| | Before | After |
| --- | --- | --- |
| Guides | 63 | 75 (12 new, 63 rewritten; none deleted: every slug is linked from a screen, an email or a fix link) |
| Steps | 332 | 339 (short: at most 60 words a step) |
| Pictures | 560 files, 260 unique | 666 files (333 steps x phone + desktop; 6 steps use a Look's own preview), 666 unique |
| External steps pictured | 0 | 61, as labelled illustrations |
| Search: the questions above | 1 of 5 useful | all found first or near the top (unit test `tests/unit/help-guides.test.ts`) |
| Tour stops | 5 (Dump, Review, Calendar, Deals, Help) | 8 (Dump, Review, Calendar, Stats, Voice overs, Deals, Media kit, Help), each with "Show me how" |

Search now drops filler words ("how do I"), matches word forms (posted, post), reads each guide's
`keywords:` and ranks title > keywords > steps, with a bonus when a keyword phrase is in the
question; if nothing matches every word it shows the closest guides instead of "Nothing found".

## Guards

- Validator `help-pictures` (admission register): zero guides; a step without exactly one picture
  named for it; missing desktop or phone file; a step with no target and no mock, or `route:
  external`; an unknown mock; two identical pictures not both marked shared; an unused picture; a
  screen without a Help link or a link to a missing guide; a tour stop outside the menu or with a
  missing guide; a checklist slug that is not a guide. Proven negatively (see the PR).
- The screenshot job fails a step whose click or target is not on screen, and a duplicate picture.
- `tests/unit/help-guides.test.ts`: every guide 3 to 8 steps, pictured, short; stats sign-ins
  framed as optional; the login guide hidden in production; one guide per feature; search answers
  her questions; the OpenRouter fake refuses a bad key.
- CI: `e2e.yml` job `help-screenshots` re-takes every picture after each merge and runs the
  validator; `job-help_screenshots.yml` opens the refresh PR on each release.
