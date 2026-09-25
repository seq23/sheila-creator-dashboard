# Sheila Creator Dashboard — Firm Build Plan

Sep 25, 2026 · exported from the Claude Docs build plan

## 1. Locked decisions

Repo: **`sheila-creator-dashboard`** (public GitHub repo). Owner: **Sheila**. Builder: you, hands-off after handoff.

| # | Decision | Locked choice |
| --- | --- | --- |
| 1 | Content | Real footage only. No AI-generated video. |
| 2 | Intake | One Dump page, two doors: **New raw footage** and **Recycle old videos**. Notes + **Dump** button. |
| 3 | Editing | Open source, automated: OpenShorts (clip finding, face-tracked 9:16, subtitles) + ffmpeg + faster-whisper, run in GitHub Actions. No CapCut in the pipeline. |
| 4 | Brand context | **Client Brain**: upload PDF / DOCX / MD / TXT. Distilled into one editable Brand Profile used by every AI step. |
| 5 | Research | **Research Brief** must exist and be approved before the first clips are cut. Sources: her accounts + web search + uploaded reports. Every claim cited. |
| 6 | AI models | OpenRouter free models by default. |
| 7 | Posting | **Buffer free plan** (TikTok, Instagram, YouTube = its 3 channels) via Buffer's API. |
| 8 | Cadence | **Hard cap: 10 posts per channel per week (30 total).** Launch default from research: TikTok 10 · Instagram 7 · YouTube Shorts 5. Adjustable in Settings. See section 10b. |
| 9 | Approval | Nothing posts unless approved. Approve all / reject all / delete one / edit one. |
| 10 | Supply | Email Sheila when fewer than 2 weeks (20 approved clips) remain. |
| 11 | Voice | Voice-clone narration built but **off** until she turns it on. |
| 12 | Cost | $0/month target. Optional paid levers are listed, never required. |
| 13 | Brand deals | Deals tab: media kit, brand finder, public contacts with source links, pitch drafts she sends herself, deal tracker. See section 12b. |
| 14 | Help | In-app Help center: step-by-step guides with auto-captured, annotated screenshots; "?" on every screen; fix-it guides linked from every error. See section 12c. |
| 15 | Testing | Builder's own test accounts for development; Sheila's accounts only at handoff. Automated tests with fake services + live checklists per phase. See section 15b. |

## 2. Ownership, users and handoff

- **Sheila owns everything.** Every account is created in her name: GitHub, Cloudflare, Buffer, OpenRouter, Resend, Firecrawl, and her Google and Meta developer access for stats.
- **You build it**, then hand off. After handoff she never needs a terminal, a code editor or you.
- **Users:** Sheila (owner, full access). Optional second login for you as a helper, which she can remove in Settings.
- **Non-technical by design:**
  - Plain words everywhere ("Dump", "Review", "Calendar"), no jargon.
  - Works on her phone: dumping and reviewing are phone-first.
  - Every screen has one obvious next action.
  - When something breaks, she gets an email that says exactly what to click, e.g. "TikTok got disconnected in Buffer. Open Buffer → Channels → Reconnect."
  - A **Health** panel shows green / yellow / red for each connection.
- **Handoff package:** the in-app Help center with picture-by-picture guides (section 12c), a filled setup checklist, and a 30-minute walkthrough.

## 3. End-to-end flow

1. **Client Brain** — she uploads her brand docs once (and adds more any time). The system drafts her Brand Profile; she edits and locks it.
2. **Research Brief** — the system researches her niche and her own account numbers and writes a cited brief: content themes, hook styles, cut styles, lengths, best posting times, and a "what to film" list. She approves it.
3. **Dump** — she uploads footage through Door A (new raw) or Door B (recycle), adds notes, presses **Dump**.
4. **Cut** — GitHub Actions turns the dump into vertical clips with subtitles, hook text and captions, guided by the Brand Profile and Research Brief.
5. **Review** — clips arrive in Review. She approves all, rejects all, deletes or edits individual clips.
6. **Schedule** — Approved clips fill the Calendar (max 10 posts per channel per week) at the best times from section 10b, later from her own data.
7. **Post** — each week's posts are handed to Buffer, which publishes to TikTok, Instagram and YouTube.
8. **Learn** — results come back; the brief's times and recommendations update weekly, and the full brief refreshes monthly.
9. **Ask for more** — when fewer than 2 weeks of approved clips remain, she gets an email with what to film next and a link to Dump.

## 4. Screens

Matches the wireframes in `docs/wireframes/`. Left sidebar on desktop, bottom tab bar on phone.

| Screen | What she does there |
| --- | --- |
| **Home** | Runway (weeks of clips left), this week's posts, anything waiting for review, health lights, big **Dump** button |
| **Dump** | Pick door, drop files, add notes, press **Dump**; see processing progress |
| **Review** | Grid of new clips: play, approve, reject, delete, edit caption/hook; **Approve all** / **Reject all** |
| **Calendar** | Week and month views; drag to move; unschedule; see posted / failed per platform |
| **Client Brain** | Upload brand docs; edit and lock the Brand Profile |
| **Research** | Read the current brief with sources; approve; refresh; upload an outside research report |
| **Stats** | What's working: top clips, best times, best cut styles |
| **Voice** | Hidden until turned on. Record/upload voice sample once, write or draft a script, generate narration |
| **Settings** | Posting cap, posting days/times, low-supply threshold, emails, connections (Buffer, stats), Health panel, Help guide |
| **Deals** | Brand cards with fit reasons and links, contact + source, pitch drafts, Open in Gmail, deal stages, follow-ups; public Media Kit page |
| **Help** | Search, Getting Started checklist, picture-by-picture guides, Fix-it guides, replay the tour |

## 4b. Connecting her accounts

One **Connect accounts** screen, shown as the first-run wizard and later under Settings → Connections. She connects everything herself. She always logs in on the platform's own page, so the dashboard never sees her passwords.

| Connection | Why | How she connects | Shown as |
| --- | --- | --- | --- |
| **Buffer** | Posts to all three platforms | **Connect Buffer** → guided steps: open Buffer → Settings → API → create key → paste. The dashboard checks the key and lists the channels it finds. | Connected · channels found |
| **TikTok (posting)** | Publishing | Added inside Buffer (Add channel → TikTok → log in). If it's missing, the dashboard shows an **Open Buffer** button with steps. | Via Buffer: connected / missing |
| **Instagram (posting)** | Publishing | Added inside Buffer; needs a Professional account (she has one) | Via Buffer |
| **YouTube (posting)** | Publishing | Added inside Buffer | Via Buffer |
| **Instagram stats** | Research + learning | **Connect with Instagram** (Meta login) → pick her account | Last synced |
| **YouTube stats** | Research + learning | **Connect with Google** → pick her channel | Last synced |
| **TikTok stats** | Research + learning | **Connect TikTok** if TikTok approves our app to read her own video stats — unknown yet; Phase 0 finds out. Otherwise **Upload TikTok export**. | Last synced / last import |
| **Hunter.io (optional)** | Brand deals: finds public partnership emails at a brand's website | **Connect Hunter** → guided steps: create a free Hunter account → API page → copy key → paste. Dashboard checks the key and shows credits left this month (free plan: 50). | Connected · credits left |

**Rules**

- Every connection has Connect, Reconnect and Disconnect, plus a one-click **Disconnect everything**.
- Tokens and keys are stored encrypted in her Cloudflare account, never in the repo or logs.
- If a connection breaks, its Health light turns red and she gets an email with the exact steps to fix it.
- Posting is blocked (clips wait safely) while Buffer or a channel is disconnected; nothing is lost.

## 5. Client Brain

**Purpose:** everything the AI knows about who Sheila is and what she wants, in one place she controls.

- **Upload:** PDF, DOCX, MD, TXT, including exports of past AI chats about her goals. Multiple files at once; add more any time.
- **Extraction:** text is pulled out in a GitHub Actions job. Scanned PDFs (pictures of text) get OCR. Files that can't be read are flagged, not silently skipped.
- **Brand Profile draft:** an OpenRouter model condenses all docs into fixed sections:
  - Who she is · Audience · Goals (90-day and 1-year) · Voice and tone · Content themes (3–5) · Do / Don't · Off-limits topics · Brand-deal fit · Calls to action
- **She edits and locks it.** The locked version is what every AI step reads (research, clip picking, captions, narration scripts). Versions are kept so she can roll back.
- **Details on demand:** original docs stay stored and searchable (Cloudflare Vectorize) so an AI step can look up a specific detail without stuffing every document into every prompt.
- **Privacy:** docs live only in her private Cloudflare storage, never in the public repo or its logs.

## 6. Research Brief

**Gate:** no clips are cut until a brief exists and Sheila approves it. After that it refreshes monthly and adjusts weekly from her results.

**Starting research is already done:** how much and when to post, from Buffer and Sprout Social studies, is in section 10b. The first Research Brief starts from that baseline and adds her niche and her own numbers.

**Inputs**

| Source | How | Cost |
| --- | --- | --- |
| Her Brand Profile | Locked profile from Client Brain | $0 |
| Her Instagram numbers | Meta Graph API (Insights) on her Professional account | $0 |
| Her YouTube numbers | YouTube Analytics API | $0 |
| Her TikTok numbers | Buffer analytics if its API exposes them (confirmed in Phase 0); otherwise she uploads TikTok's data export on the Stats page | $0 |
| Web research | Firecrawl search (1,000 free credits/month) + an OpenRouter free model to read and summarize | $0 |
| Optional deeper search | OpenRouter's Perplexity search, about $0.005 per search (about $0.25 per full brief) — switch in Settings, off by default | cents |
| Outside reports | She uploads a ChatGPT Deep Research or Perplexity report; treated as a source like any other | $0 |

**The brief contains:** audience snapshot · 3–5 content themes · hook formulas that fit her voice · cut styles and lengths to favor · best days and times per platform · comparable creators to learn from · a "what to film next" shot list.

**Truth rules (enforced in the prompt and the page):** every claim links its source; each claim is labeled *her data* or *web*; weak or conflicting evidence is marked "uncertain"; nothing uncited appears as fact.

## 7. Dump: two doors

| | Door A — New raw footage | Door B — Recycle old videos |
| --- | --- | --- |
| What goes in | Unposted phone footage, long takes, vlogs, B-roll | Videos already posted anywhere |
| Extra fields | Notes, optional topic tags | Notes, when/where it was posted, rough views if known |
| Recipe | Find best moments → cut 15–60s clips → 9:16 face-tracked → subtitles → 2 hook variants each | New first 2 seconds, new subtitle style, trim/re-order, new caption and hashtags |
| Guard rails | Skip dead air, blur and near-duplicates | 90-day cooldown per platform; never re-upload the identical file; best past performers first |

**Upload experience**

- Drag-and-drop on desktop, "choose from camera roll" on phone. Many files at once.
- Files upload in chunks straight to storage with a progress bar each; a dropped connection resumes instead of restarting.
- Notes box for the whole dump; optional note per file.
- **Dump** button starts processing. Status: Uploading → Cutting → Ready for review (and an email when ready).
- Raw originals are deleted 7 days after processing to stay in free storage; finished clips are kept until posted plus 30 days.

## 8. Editing engine

Runs as a GitHub Actions job per dump (public repo = unlimited standard runner minutes).

**Tools (all free, open source)**

- **OpenShorts** (MIT core) — finds strong moments, face-tracks to 9:16, burns subtitles. Its AI step is pointed at OpenRouter through its OpenAI-compatible setting. Only its free, self-hosted parts are used; its paid add-ons stay off.
- **faster-whisper** — word-level transcripts.
- **ffmpeg** — trims, silence removal, loudness, cover frames, final encode.
- **Remotion** (optional, Phase 9) — branded subtitle styles and end cards. Free license for individuals.

**Pipeline**

1. Normalize format and audio.
2. Transcribe.
3. Pick moments using transcript + dump notes + Brand Profile + Research Brief.
4. Cut using one of four recipes: *Tight talking-head* (20–45s, jump cuts) · *Hook-first* (best line moved to second 0) · *Story* (45–90s) · *Montage* (B-roll + on-screen text).
5. Format: 9:16 face-tracked crop, subtitles, loudness, cover frame.
6. Write copy per platform: caption, hashtags, on-screen hook.
7. Score each clip; clips under the quality bar are hidden by default.
8. Save clips and metadata; mark dump "Ready for review."

**Volume:** it makes more than needed (target 2–3x the weekly need) and ranks them, so each week's slots go to the best.

**Not yet proven:** OpenShorts' behavior and speed in GitHub Actions on CPU. Phase 0 runs it on a real sample before we commit; fallback is our own ffmpeg + MediaPipe face-crop pipeline.

## 9. Review and approval

- Clips appear grouped by dump, best-scored first. Filters: door, recipe, platform.
- **Bulk:** Approve all · Reject all · select several and approve/reject.
- **Per clip:** play · approve · reject · **delete** (removes the file permanently, with a confirm) · edit caption, hashtags and hook text · untick platforms it shouldn't go to.
- Rejected clips stay in a "Rejected" tab for 7 days in case she changes her mind, then are removed.
- Rejections with a reason ("too long", "not on brand", "bad hook") feed the learning loop.
- Nothing reaches the Calendar without approval. Auto-approve does not exist in v1.

## 10. Scheduling and posting via Buffer

**Why Buffer:** TikTok's own API won't approve a private tool that posts to accounts you manage, and unapproved apps can only post privately. Buffer is already approved, so public TikTok posts go through it at $0. Instagram and YouTube go through Buffer too, so there is one connection to maintain.

**Buffer free plan facts:** 3 channels · 10 queued posts per channel at a time · API included (1 key, 3,000 requests per 30 days) · videos passed as a public link that must stay live until the post publishes.

**How our scheduler works**

- The dashboard holds the full calendar (weeks to months ahead). Buffer only ever holds the next 7 days — at the cap that's never more than 10 per channel.
- Default slots come from section 10b: 10 unique clips a week; every clip goes to TikTok, the best 7 also to Instagram Reels, the best 5 also to YouTube Shorts, staggered by a few hours.
- Mix rules: new and recycled clips are blended; never two clips from the same source video back to back.
- She can drag to move, unschedule (back to approved pool), or swap two clips.
- A cron job every hour: loads the next posts into Buffer, reads back status (queued / posted / failed), retries failures twice, then flags them on Home and in an email.
- Clip files are kept until they've posted, so Buffer's links never break.

**Fallback if Buffer changes its free plan:** posting is one isolated module; swap to Buffer Essentials for TikTok only and post Instagram and YouTube directly through their APIs.

## 10b. Posting baseline: how much and when (research)

This is the **starting schedule**, taken from large public studies. After about 4 weeks her own numbers take over (Phase 8). All times are **her audience's local time** (set in Settings).

**How much (cap: 10 per channel per week)**

| Platform | What the data says | Launch default |
| --- | --- | --- |
| TikTok | Buffer, 11.4M posts: vs. 1 post/week, 2–5 posts gave +17% views per post, 6–10 gave +29%, 11+ gave +34%. Median views stay flat; more posts mostly means more chances at a breakout. | **10/week** (the cap) |
| Instagram Reels | Buffer: 3–5/week gave about 12% more reach per post than 1–2; 6–9 gave 18%; 10+ gave 24%, with shrinking gains. | **7/week** |
| YouTube Shorts | Buffer: 1–3/week; 3/week didn't clearly beat 1/week on engagement. Some smaller sources push daily. *Evidence mixed.* | **5/week**, tested up or down |

Total at launch: **22 posts from 10 unique clips a week.** Ramp rule: raise Instagram or YouTube toward 10 only if its per-post reach holds for 2 straight weeks and clip supply allows.

**When**

The big studies disagree on TikTok: Sprout Social (2B engagements) says Tue–Thu 2–6 pm and to avoid weekends; Buffer (7.1M posts) ranks Saturday best, with Sunday 9 am, Monday 1 pm and 6–11 pm evenings strong. The launch schedule leans on the overlap (weekday late afternoon and evening) and includes a few weekend slots so her data can settle it.

| Platform | Launch slots |
| --- | --- |
| TikTok (10) | Mon 3 pm · Tue 4 pm · Tue 8 pm · Wed 5 pm · Wed 8 pm · Thu 3 pm · Thu 8 pm · Fri 4 pm · Sat 7 pm · Sun 9 am |
| Instagram Reels (7) | Mon 7 pm · Tue 1 pm · Tue 7 pm · Wed 12 pm · Wed 8 pm · Thu 9 am · Sun 9 pm |
| YouTube Shorts (5) | Tue 4 pm · Wed 4 pm · Thu 5 pm · Fri 4 pm · Sat 5 pm |

Timing basis: Buffer (Instagram, 9.6M posts: Wednesday best; evenings 6–11 pm strongest except Thursday mornings; Reels best on Wed/Thu evenings), Sprout Social (Instagram: Tue and Wed peak, weekends lowest), Buffer (YouTube Shorts: Friday 4 pm best, Saturday close). All are averages across many accounts, not a promise for her.

Sources: [Buffer: best times, all platforms](https://buffer.com/resources/best-time-to-post-social-media/) · [Buffer: Instagram, 9.6M posts](https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/) · [Sprout Social: TikTok](https://sproutsocial.com/insights/best-times-to-post-on-tiktok/) · [Sprout Social: Instagram](https://sproutsocial.com/insights/best-times-to-post-on-instagram/) · [Buffer: TikTok frequency, 11.4M posts](https://buffer.com/resources/how-often-should-you-post-on-tiktok/) · [Buffer: frequency guide](https://buffer.com/resources/social-media-frequency-guide/)

## 11. Supply monitor, emails, health

**Runway** = weeks of approved, unposted clips at the current weekly cap. Shown big on Home.

| Email | When | Contains |
| --- | --- | --- |
| **Time to dump** | Runway under 2 weeks (20 clips); repeats every 3 days until a dump arrives | Weeks left, top 3 "what to film next" from the brief, button to Dump |
| **Clips ready** | A dump finishes cutting | How many clips, button to Review |
| **Posting problem** | A post fails after retries | Which clip/platform, plain-English fix |
| **Connection needs you** | Buffer, Instagram stats or YouTube stats disconnects | Exactly what to click to reconnect |
| **Weekly recap** (optional) | Monday | Last week's top clip, runway, what's scheduled |

**Health panel** (Settings): green / yellow / red for Buffer, each channel, stats connections, storage used, last successful cutting job, last successful posting run. Every red has a "How to fix" link.

Email is sent through Resend's free tier from her own domain or a default sender.

## 12. Voice narration (optional, off by default)

- **Off at launch.** The Voice tab is hidden until Sheila switches it on in Settings. Clips remain real footage either way.
- **Model:** Chatterbox by Resemble AI (open source, MIT). Clones from a short, clean voice sample; runs on CPU in GitHub Actions (slower, fine for short narrations). Its output carries an inaudible watermark.
- **Setup once:** she records in the browser or uploads a sample, reads a short consent line ("This is my voice and I authorize its use in this dashboard"), and ticks a consent box. Only the owner login can create or replace the voice.
- **Use:** type a script, or ask the AI to draft one from the Brand Profile → Generate → listen → download MP3, or attach it to a clip in Review.
- **Controls:** delete voice sample and voice model at any time with one button; every generated file is logged.
- **Not yet proven:** Chatterbox speed and quality on Actions CPU with her voice — tested at the start of its phase.

## 12b. Brand deals

**Purpose:** find brands that fit her, find the right public contact, and hand her ready-to-send pitches with the right links — she stays the one who sends.

**1. Media kit (her link in every pitch)**

- A public, phone-friendly page on her dashboard domain: photo, one-line bio, content themes, audience snapshot, follower counts and average views per platform, 3 best clips, past brand partners, contact button.
- Numbers come from the stats connections and refresh weekly. Rates are optional and only shown if she enters them.
- Also downloadable as a one-page PDF.

**2. Brand finder (weekly job)**

| Where brands come from | How |
| --- | --- |
| Brands she already uses and loves | She lists them (strongest pitches) |
| Brands sponsoring creators like her | Web search for sponsored posts (#ad, "paid partnership") by the comparable creators named in her Research Brief |
| Brands with creator / ambassador / affiliate programs in her niche | Web search for program pages matching her content themes |

Each brand card shows: fit score with plain reasons, why now (e.g. "just sponsored 3 creators in your niche"), links (website, creator program page, their socials), and the contact route. Anything on her **off-limits** list in the Brand Profile is never suggested.

**3. Contact finder — public business contacts only**

- Priority: the brand's creator-program application form → a published partnerships / influencer / PR email on the brand's site → their agency contact if published.
- Optional: Hunter.io free plan (50 credits a month, API included) to look up role addresses like partnerships@ at a brand's domain.
- Every contact shows the link it was found on. No personal emails, no guessed addresses, no scraping of individuals.

**4. Pitch drafts**

- For each brand: subject line, short email (names one of their products, her audience fit in numbers, 1–2 relevant clip links, media-kit link, one clear ask), a short DM version, and two follow-ups (day 5, day 12).
- Written from her locked Brand Profile in her voice. She edits anything.

**5. Sending — she clicks send**

- **Open in Gmail** (pre-filled compose window) or **Copy**. For application forms: **Open form** with her answers ready to paste.
- The dashboard never mass-emails. This keeps pitches personal and her email account's reputation safe.

**6. Deal tracker**

- Stages: Found → Drafted → Sent → Replied → Negotiating → Won / Passed.
- Follow-up reminders on Home and in the weekly recap email. She marks replies with one click.
- **Won deals** get deliverables with due dates. A sponsored clip is flagged **Paid partnership** in Review: the caption gets a clear #ad disclosure, and she gets a reminder to switch on the platform's paid-partnership label (FTC disclosure rules). Whether Buffer can set that label for her is unknown until tested.

**7. Platform marketplaces**

- The dashboard tracks eligibility for the platforms' own brand marketplaces and tells her when she qualifies. TikTok One (Creator Marketplace) currently asks for 10,000+ followers, 1,000+ views in the last 30 days, 3+ recent posts, and age 18+ (per a 2026 creator guide; checked again before relying on it).

**Cost:** $0 (Firecrawl + OpenRouter free models; Hunter free plan optional).

Sources: [Hunter free plan](https://help.hunter.io/en/articles/11060999-what-s-included-in-hunter-s-free-plan) · [TikTok marketplace requirements (Cabana Studio)](https://cabanastudio.io/blog/tiktok-creator-marketplace-requirements) · [FTC disclosure rules for influencers](https://thesocialmedialawfirm.com/blog/influencer-law/what-are-ftc-disclosure-rules-for-influencers-in-2026-complete-guide-examples/)

## 12c. Help center

**Purpose:** Sheila can do everything alone. Every task has a short, picture-by-picture guide written for someone who has never used a dashboard.

**Where help shows up**

- **Help tab** in the sidebar (and phone menu): search box, a Getting Started checklist, guides by topic, and a Fix-it section.
- **"?" button on every screen** opens the guide for that exact screen.
- **First-login tour:** 5 short pop-ups pointing at Dump, Review, Calendar, Deals and Help. Can be replayed any time.
- **Every error and email links to its fix guide** (e.g. "Instagram disconnected" → "Reconnect Instagram in Buffer").

**How each guide looks**

- One task per guide, 3–8 steps, one action per step.
- Each step: a big screenshot with a numbered circle and arrow on the exact button, plus one plain sentence ("Tap the blue **Dump** button").
- Progress ("Step 2 of 5"), Back / Next, and **Did this work? Yes / No** at the end. "No" opens the matching Fix-it guide or a pre-filled email to her helper.
- Works on phone (screenshots swap to phone versions) and can be printed or saved as PDF.
- Reading level: short sentences, no jargon; any technical word links to a one-line glossary entry.

**Guide list (v1)**

| Getting started | Everyday | Brand deals | Fix-it |
| --- | --- | --- | --- |
| Log in · Connect Buffer · Add TikTok, Instagram, YouTube in Buffer · Connect stats · Connect Hunter (optional) · Upload brand docs · Approve your research brief | Dump new footage (phone) · Recycle old videos · Review and approve clips · Edit a caption · Move or remove a post · What "runway" means · Change posts per week | Update your media kit · Send a pitch · Mark a reply · Mark a paid partnership | A post failed · Reconnect an account · Storage almost full · Upload your TikTok export · I didn't get an email · Clips look wrong |

**How the screenshots stay correct**

- **Dashboard screenshots are made automatically.** A Playwright script opens the app with demo data, walks through each guide, draws the numbered callouts, and saves phone + desktop images. It runs in GitHub Actions on every release, so guides never show an old screen. Demo data only — never her real content.
- **Outside sites (Buffer, Instagram, Google, TikTok, Hunter)** can't be captured automatically. The builder captures these once, blurs any personal details, and each guide shows "Last checked: [date]". A **Report a problem with this guide** button flags it for update.
- Guides are Markdown files in the repo (`help/`), so text changes don't need code changes.

**Optional later:** an **Ask a question** box that answers only from these guides (OpenRouter free model) and links the guide it used. Off by default.

**Phasing:** every phase ships the guides for what it adds; Phase 12 audits all of them with a real walkthrough by Sheila.

## 13. Architecture, stack, public-repo security

| Job | Tool (free tier) |
| --- | --- |
| Dashboard | Cloudflare Pages (React + Vite, mobile-first) |
| API, crons | Cloudflare Workers + Cron Triggers |
| Login | Cloudflare Access — email one-time code, no passwords |
| Database | Cloudflare D1 |
| Files | Cloudflare R2 (10 GB free, no download fees) |
| Doc search | Cloudflare Vectorize |
| Heavy jobs (cutting, doc extraction, research, voice) | GitHub Actions, started by the Worker |
| AI | OpenRouter (free models) |
| Web search | Firecrawl (free credits) |
| Posting | Buffer API |
| Email | Resend |

**Flow of a dump:** browser → signed upload links → R2 → **Dump** → Worker records it in D1 and starts an Actions job → job downloads from R2, cuts, uploads clips → calls back the Worker → "Ready for review."

**Public-repo security rules (non-negotiable)**

- Anyone can read the code and the Actions logs. So jobs **never print** transcripts, brand text, captions, file names, links or IDs; logs show only step names, counts and pass/fail.
- All of her data lives in R2/D1 under her Cloudflare account. The repo holds code only.
- Keys live only in GitHub Secrets and Cloudflare secrets. Jobs start only from the Worker (signed request), never from outside pull requests.
- Worker-to-job and job-to-Worker calls are signed with a shared secret and time-limited.
- Upload links expire in minutes; clip links handed to Buffer are long random paths that expire after posting.
- Google stats connection is set to "In production" (not "Testing"), because testing-mode connections expire every 7 days — that would break hands-off.

## 14. Data model

| Table | Holds |
| --- | --- |
| brand_docs | id, file name, type, r2_key, extract status, uploaded_at |
| brand_profile | version, sections (JSON), locked, locked_at |
| research_briefs | version, body with cited claims (JSON), sources, status (draft / approved), created_at |
| dumps | id, door (new / recycle), notes, status (uploading / cutting / ready / failed), created_at |
| assets | id, dump_id, r2_key, duration, file note, original post date + platform + views (recycle only), raw_deleted_at |
| clips | id, asset_id, start, end, recipe, hook_text, caption, hashtags, score, r2_key, status (draft / approved / rejected / deleted), reject_reason |
| posts | id, clip_id, platform, scheduled_at, buffer_post_id, status (planned / in_buffer / posted / failed), url, error |
| metrics | post_id, captured_at, views, likes, comments, shares, saves, avg_watch |
| voice | sample r2_key, consent_at, enabled; narrations (id, script, r2_key, created_at) |
| settings | weekly caps per platform, posting days/times, runway threshold, emails, feature switches |
| jobs | id, type, status, run id, safe error summary |
| connections | service, status, last_ok_at, last_error |
| brands | id, name, website, program_url, socials, fit_score, fit_reasons, why_now, source_links, status (suggested / saved / hidden) |
| brand_contacts | id, brand_id, kind (form / role email / agency), value, found_on_url, checked_at |
| pitches | id, brand_id, contact_id, subject, body, dm_text, followup_1, followup_2, clip_links, status, sent_at, next_followup_at |
| deals | id, brand_id, stage (replied / negotiating / won / passed), terms note, deliverables (clip_id, due_at, platform), paid_partnership |
| media_kit | bio, photo r2_key, featured clip ids, past partners, rates (optional), public slug, updated_at |

## 15. Phase ledger

Each phase = one artifact (full repo snapshot ZIP), structurally checked, then validated locally. Each needs approval before it's built.

| Phase | Delivers | Done when |
| --- | --- | --- |
| **0. Proof tests** | Accounts created; Buffer API test post (R2-hosted clip) to TikTok, IG, YouTube; OpenShorts run on a real sample in Actions | Public posts land on all 3 at $0, and a sample produces usable clips |
| **1. Foundation + Dump** | Repo, login, D1, R2 chunked uploads, two-door Dump page with notes and **Dump** button, Home shell, phone layout, Connect accounts screen (Buffer + channel check) | A multi-GB dump uploads from her phone and shows on Home |
| **2. Client Brain** | Doc upload, extraction + OCR, Brand Profile draft/edit/lock, versions | Profile locked from her real docs |
| **3. Research Brief** | Stats connections (IG, YouTube, TikTok import), Firecrawl + OpenRouter research, cited brief, approve | She approves a brief with every claim sourced |
| **4. Editing engine** | Actions pipeline, 4 recipes, face-tracked 9:16, subtitles, copy, scores | A dump becomes ranked clips automatically |
| **5. Review** | Grid, bulk approve/reject, delete, edit, reject reasons | Only approved clips can be scheduled |
| **6. Calendar + Buffer** | Slotting (launch 10/7/5, cap 10 per channel), drag/unschedule, hourly Buffer sync, status, retries | 2 weeks post correctly with no one touching it |
| **7. Emails + Health** | Runway, all 5 emails, Health panel with fixes | Every alert fires correctly in tests |
| **8. Learning loop** | Metrics pull, weekly updates, Stats page | Recommendations change from her real numbers |
| **9. Recycle + polish** | Cooldowns, re-hooks, duplicate check, branded subtitle styles | Old videos return without looking reposted |
| **10. Brand deals** | Media kit page + PDF, brand finder, public contact finder, pitch + follow-up drafts, Open in Gmail, deal tracker, Paid-partnership flag | She sends her first 5 pitches from real brand cards |
| **11. Voice (optional)** | Consent flow, Chatterbox cloning, narration, attach to clip; hidden switch | She can generate narration once switched on |
| **12. Hardening + handoff** | End-to-end tests, D1 backups, Help center audit (every guide walked through by Sheila), ownership transfer, walkthrough | She runs a full cycle alone |

**Next artifact:** Phase 0 + Phase 1.

## 15b. Testing and environments

**Two separate environments, never mixed**

| | Test (builder's) | Production (Sheila's) |
| --- | --- | --- |
| Accounts | Builder's GitHub, Cloudflare, Buffer, OpenRouter, Firecrawl, Resend, Hunter + throwaway TikTok, Instagram Professional, YouTube | Sheila's own accounts, created at the setup session |
| Data | Demo data and neutral sample clips only | Her real footage and docs |
| Keys | Test keys | Her keys; never copied into test |
| When | Every phase | Only at handoff (Phase 12) |

**Layer 1 — automated, no accounts needed (runs on every change)**

- **App logic:** unit tests for slotting (10/7/5, cap 10 per channel), runway math, cooldowns, approval rules, deal stages.
- **Local stack:** Cloudflare's local tools run the Worker, D1 and R2 on the machine; integration tests cover upload → Dump → job → clips → approve → schedule.
- **Fake outside services:** Buffer, OpenRouter, Firecrawl, Hunter, Resend, Meta, Google and TikTok are replaced by stand-ins that return realistic answers, including failures (expired token, rate limit, rejected video). Tests prove each failure shows the right Health light, email and fix guide.
- **Video pipeline:** short non-personal sample clips run through the real cutting job in GitHub Actions; tests check 9:16, length, subtitles, audio level and that the file plays.
- **End-to-end:** Playwright drives the dashboard at phone and desktop sizes like Sheila would: dump, approve all, delete one, edit a caption, move a post, send a pitch to "Open in Gmail", open a help guide. The same run captures the Help screenshots.
- **Public-repo safety:** a test runs a full job with marker text in the demo data and fails the build if that text appears in any log.

**Layer 2 — live checks with the builder's test accounts (per phase, done by a person)**

- Claude Code cannot log into TikTok, Instagram, Google or Buffer, approve their login pop-ups, or look at a feed. Each phase ends with a short **live checklist** for the builder, e.g. "Connect Buffer → press Dump on sample-01 → confirm the post appears on the test TikTok", and the result is reported back before the phase is marked done.
- Phase 0 is mostly Layer 2: a real public post through Buffer to each test account, then deleted.
- Test posts use a neutral test clip. Nothing is ever posted to Sheila's accounts for testing.

**Layer 3 — production acceptance (Phase 12, with Sheila)**

- Her dashboard is set up with her own accounts.
- One real dump of her footage goes through to Review; nothing posts until she approves it.
- She walks every Getting Started guide herself; anything confusing is fixed before handoff.

**Done means:** Layer 1 green in GitHub Actions + Layer 2 checklist confirmed by the builder. Anything that can only be checked live and hasn't been is listed as **not yet proven** in that phase's delivery note.

## 16. One-time setup checklist

Done together with Sheila in one sitting, all in her name.

- [ ] GitHub account; repo `sheila-creator-dashboard` created under her account (or transferred to her at handoff)
- [ ] Cloudflare account (free); Pages, Workers, D1, R2, Access enabled
- [ ] Buffer free account; connect TikTok, Instagram (Professional), YouTube; create API key
- [ ] OpenRouter account; API key
- [ ] Firecrawl account; API key
- [ ] Resend account; sender set up
- [ ] Meta developer app (for Instagram stats), Sheila as admin
- [ ] Google Cloud project (for YouTube stats), set to "In production"
- [ ] Hunter.io free account (optional, for brand-deal contacts); API key
- [ ] All keys pasted into the dashboard's first-run setup screen (stored encrypted; never shown again)
- [ ] Test dump of 2–3 videos end to end

Delivered as an in-app first-run wizard, so each step shows where to click.

## 17. Costs, limits, risks, sources

**Expected monthly cost: $0.** Optional levers: deeper Perplexity search (about $0.25 per brief), an OpenRouter credit top-up for higher free-model limits, R2 beyond 10 GB (about $0.015 per GB per month).

| Risk | Mitigation |
| --- | --- |
| Buffer changes free plan or API | Posting is one module; fallback in section 10 |
| OpenShorts too slow or unreliable on CPU | Proven in Phase 0; fallback ffmpeg + MediaPipe pipeline |
| Free AI model rate limits | Small batched calls, retries, optional credit top-up |
| Platforms suppress recycled content | Cooldowns, re-hooks, no identical re-uploads, approval |
| Connections expire | Health panel + plain-English emails; Google set to production |
| Private data leaks via public repo | Logging rules and secrets rules in section 13 |
| TikTok stats not reachable for free | Manual export upload on Stats page |
| Pitches look spammy or reach the wrong person | Public business contacts only with source links; she sends each one herself; no mass email |

**Sources:** [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) · [TikTok unaudited limits (Vorp Labs)](https://vorplabs.com/agent-tools/tiktok-content-posting-api) · [Buffer: What is Buffer's API?](https://support.buffer.com/en-us/articles/what-is-buffers-api-GtIYIQilz5) · [Buffer: posts you can schedule in advance](https://support.buffer.com/article/643-how-many-posts-can-i-schedule-in-advance) · [OpenShorts](https://github.com/mutonby/openshorts) · [OpenRouter web search pricing](https://openrouter.ai/docs/guides/features/plugins/web-search) · [Firecrawl free search APIs](https://www.firecrawl.dev/blog/best-free-web-search-apis) · [Chatterbox](https://huggingface.co/ResembleAI/chatterbox) · [YouTube videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
