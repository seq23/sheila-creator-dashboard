# YouTube: what is at stake and what we are doing

Owner's note, 26 Sep 2026. Read this before touching anything YouTube-related. It exists because
two of us spent a day re-deriving these facts, and one of them (the "private lock") turned out
to be wrong.

## The two ways Sheila Studio reaches YouTube

| Path | What it carries | Who signs in | Google review needed |
|---|---|---|---|
| **Buffer** (`worker/services/buffer.ts`) | Shorts: vertical, ≤ 3 minutes. Also TikTok and Instagram. | Sheila, once, inside Buffer. | None. Buffer is Google-approved. |
| **Direct upload** (`worker/routes/oauth.ts`, the `fullvideo` job) | Full-length videos: title, description, chapters, tags, thumbnail, scheduled publish time, privacy, Calendar moves. | Sheila, once, on Google's page via **Connect YouTube (full videos)**. | Optional (see below). It works without it. |
| **Public numbers** (`YOUTUBE_API_KEY`) | Stats: subscribers, views, per-video counts. Read-only. | Nobody. | None. |

Buffer's YouTube posting is **Shorts only** (proven 26 Sep 2026: Buffer refused a 200 s
landscape video with "must be no longer than 3 minutes … must be vertical"). That is why the
direct upload path exists.

## Facts we proved (do not re-derive)

- **Uploads from this app are NOT locked to private.** Test on 26 Sep 2026, throwaway channel
  "Sequoia Taylor": video `3bHoCHeBTgw` uploaded private with `publishAt` a week out read back
  as `private` **with the publishAt kept**, `uploadStatus: uploaded`, no rejection reason. A
  second upload set to plain private stayed private. The "unaudited API project ⇒ private lock"
  belief was wrong for this app; the owner's other channel (how-we-know, account
  cryptoclearr@gmail.com) uploads through the same `videos.insert` API with 40+ videos
  scheduled and publishing, and has never been audited.
- **Scopes in use:** `youtube.upload` (upload), `youtube.force-ssl` (move a scheduled video's
  publish time; set it private when taken off the Calendar), `youtube.readonly` (read back), and
  optional `yt-analytics.readonly` (Stats watch time). Google words `youtube.force-ssl` as "see,
  edit, and permanently delete" — **the app never deletes a video**; taking one off the Calendar
  makes it private.
- **Custom thumbnails need a phone-verified channel.** YouTube answers 403 otherwise; Home shows
  "Verify your channel's phone number in YouTube" with the link. YouTube's rule, not ours.
- **Quota:** `videos.insert` costs 1,600 of the project's 10,000 daily units → the job caps at 3
  uploads a day and queues the rest with a plain note.
- **Sign-in lifetime:** the Google app is **published** ("In production"). Had it stayed in
  "Testing", every sign-in would expire after 7 days. Never move it back to Testing.

## What Sheila sees today, and why verification is being filed

The Google project is registered under the owner's account (seq.taylor@gmail.com, project
`sheilastudio-staging-p0`; the owner chose to keep it there, not transfer it to Sheila). The app
is published but **not yet verified**, and it asks for a *sensitive* scope, so Google shows
Sheila, once, on connect:

1. "Google hasn't verified this app" → small **Advanced** link
2. **Go to seq-taylor.workers.dev (unsafe)**
3. The consent page → **Continue**

It works. It is ugly. The help guide `connect-youtube-full-videos` shows each step with a
picture.

**Google OAuth verification** was filed on 26 Sep 2026 (Search Console ownership of
https://sheilastudio.seq-taylor.workers.dev verified by HTML tag; demo video unlisted at
https://youtu.be/7R7noD6LCCg; scopes and justifications on Data Access). It is polish, not a
requirement: once approved, step 1–2 disappear and Sheila sees a normal Continue. Google
usually answers by email to the owner in days to a few weeks. Nothing waits on it.

how-we-know never needed this because its app and its only user are the same account: the
developer clicked through the warning once and nobody else ever sees it.

## When something goes wrong

- Red light "Reconnect YouTube" → her sign-in was revoked or expired, or a scope is missing;
  the full video falls back to **Upload it yourself** (download + youtube.com/upload + copied
  title/description/chapters) and is marked Posted when it appears on her channel.
- A read-back that does not match what was intended (wrong privacy, missing publishAt) is a
  red light with a named fix, never a silent pass.
- Never delete a video from code. Take it off the Calendar → private.

Related: `docs/EDITORS.md` (CapCut and friends), `RUNBOOK.md` (secrets: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `YOUTUBE_API_KEY`; rotation), `help/guides/connect-youtube-full-videos.md`,
`help/guides/post-a-full-video.md`.
