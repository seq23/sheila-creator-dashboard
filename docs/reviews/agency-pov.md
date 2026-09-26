# What a talent manager does that Sheila does not have (agency point of view)

Written from the seat of a talent manager at a creator agency who closes brand deals every week.
The Deals tab is built to do this job underneath; Sheila sees one next step and one draft at a
time. Each rule below names the file in `worker/domain/` that holds it, and each file has tests.

## How we price (`ratecard.ts`)

- **A rate card by deliverable, not "a post".** TikTok video, Instagram Reel, Story set, YouTube
  Short, YouTube integration, UGC with no posting. Every line has three private numbers: the
  **floor** (walk away below it), the **target** (what we open near), and the public
  **starting at**. The public kit shows "starting at" or "rates on request", never the floor.
- **The base fee buys one organic post, 30 days of the brand reposting it, no exclusivity.**
  Everything else is priced on top, and we always say so in writing:
  - **Usage** (the brand runs her video on its own channels or site): a percentage of the base
    per 30 days, and a separate, bigger line for **paid usage / whitelisting / Spark Ads**
    (her video as an ad from her handle). "Perpetual" or "in all media" is never included free.
  - **Exclusivity** (no competing brand for a period): a percentage of the base per month, and
    only for a named category ("candles", not "home").
  - **Rush** (under 7 days from brief to post): a fixed uplift.
  - **Bundles** (three videos, or Reel + Stories): a small discount per piece, never on add-ons.
- **Numbers come from somewhere.** Her own past fees first; a published benchmark second, named
  with its link and date; if we have neither, we say "no benchmark: set your own" instead of
  inventing a CPM.

## How we qualify inbound (`offers.ts`)

- **Who is the buyer?** The brand itself, an agency buying for a brand, a platform marketplace,
  or a gifting / affiliate program dressed up as a deal. An agency has a budget and a deadline;
  gifting has neither.
- **Budget signal:** a number in the email, a named campaign, a paid-partnership history. "We'd
  love to send you product" and "exposure" are zero.
- **Brief quality:** deliverables, dates, usage, approvals written down = serious buyer.
- **Brand fit:** her themes and off-limits list.
- **Red flags:** perpetual or unlimited usage, exclusivity with no fee, net-60 or longer,
  unpaid "gifting only", "exposure", rights to her name / likeness / voice, unlimited revisions,
  payment only after "performance".
- Verdict: **worth a reply**, **counter**, or **decline**, with the one reason.

## How we pitch (`emails.ts`, `prospects.ts`)

- **Research first:** what the brand is launching, who they already pay, which creators near
  her size ran #ad posts for them. The pitch names one real thing we found, with its source.
- **Lead with a specific idea**, not "would you be open to a partnership": "a 30-second Sunday
  brunch reset using your stoneware".
- **Three options, anchored high:** the full package first (three videos + usage), then the
  standard (one video), then the entry (UGC only or a Story set). Brands pick the middle.
- **Agencies get a different pitch:** roster-style, her numbers and categories up front, "add me
  to your list for home and hosting campaigns".
- **Follow up three times, then close politely:** day 5, day 12, day 19 (the last one closes the
  loop). Then stop and mark it "no reply".

## How we negotiate (`ratecard.ts` `counterOffer`, `emails.ts` scripts)

- **Never say the first number when we can avoid it:** ask for their budget and brief first.
- **Trade scope, not price:** if they push on price, cut a deliverable, shorten usage, drop
  exclusivity. The fee per piece of work does not move below the floor.
- **Usage and exclusivity are the levers:** they cost the brand the most and her the least to
  give in a narrow form (30 days, one category).
- **Terms:** net-30 at most; 50% up front on deals over $1,000; a **kill fee** (50% if they
  cancel after the brief is approved, 100% after the video is made); two rounds of revisions.

## How we run delivery (`delivery.ts`)

- Brief received and confirmed in writing → concept → draft to the brand → up to two approval
  rounds → post inside the agreed window with #ad and the platform's paid-partnership label →
  **results report at day 7** with her real numbers (views, likes, saves, shares, from Stats) →
  invoice → payment reminder at the due date → **rebook note 30 days after delivery**.

## What the manager keeps (`memo.ts`)

A **deal memo** per deal, one screen: who (brand, contact, buyer type), what (deliverables),
money (fee, add-ons, upfront, kill fee, paid so far), dates (brief, draft, post window, report,
invoice due), rights (usage, paid usage, exclusivity), status, and the one next step.

## What changes for Sheila

- The first thing she sees is **money**: pitched this month, replies, deals won, dollars agreed,
  dollars paid, and **brands to pitch this week**, ranked by expected money with the arithmetic
  shown.
- Every deal card says **the one thing to do next and when**; overdue rises to the top.
- Every step has **the email already written**: in her voice, with her real numbers and the
  package and price from her rate card, with a "before you send" check. She sends it from Gmail.
