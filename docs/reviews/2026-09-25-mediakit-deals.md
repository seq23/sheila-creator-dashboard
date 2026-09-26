# Hostile review: Media kit and Brand deals (25 Sep 2026)

How this was done: `origin/main` at bf94031, built, served by `tests/e2e/serve.sh` with fake
services on port 8802, the demo data from `tests/e2e/seed-demo.sql` loaded, and both screens
used as Sheila would on an iPhone 13 (390 wide) and a 1280 desktop with Playwright: Deals list,
a brand with no pitch, a drafted pitch, a sent pitch, the Media kit tab, the public kit
`/kit/sheila`, the printable page and the PDF Chrome makes from it. Screenshots of what she saw
before the overhaul: `docs/design/mediakit-deals/before/`.

The stance: a brand manager at a candle or tableware company opens her kit link from a cold
email, and a talent manager at a creator agency looks over her shoulder at the Deals tab. Every
line below is something either of them would laugh at, something that wastes her time, or a
claim the screen makes that the code does not back. Rating: **blocker** (loses money, loses a
deal, or tells a brand something untrue), **weak** (works but amateur or unhelpful), **polish**.

## Media kit

| # | Finding | Rating |
| --- | --- | --- |
| K1 | **Numbers carry no date and no source.** "12.4K followers" with no "as of" and no "from TikTok". A brand manager cannot tell a live figure from a number typed last year. The footer "Numbers refresh weekly from the platforms" is not backed: TikTok numbers only change when she uploads an export; Instagram/YouTube only when those stats are connected. | blocker |
| K2 | **Showcase clips silently vanish 30 days after they post.** `crons/daily.ts` clears `media_token` on every clip 30 days after posting; the kit only shows clips with a token, so her best clips drop off the kit with no warning. | blocker |
| K3 | **Changing "Link name" breaks every link she has already sent.** The old `/kit/<slug>` 404s ("No media kit here") the moment she saves; no warning, no redirect. | blocker |
| K4 | **Every save is live.** There is no draft: a half-typed bio or a wrong rate is public the moment she taps Save. No versions, no way back. | blocker |
| K5 | **No packages or prices a brand can act on.** "Rates (optional)" is six free-text label/price pairs, no "starting at", no "rates on request", no deliverable structure, no usage or exclusivity add-ons. Brands read this as "not a professional". | blocker |
| K6 | **The PDF is a plain one-page text sheet.** No photo, no logo, no handles, no QR code, clips printed as long raw `/media/<token>` URLs a reader must type. A brand manager would not forward it. | blocker |
| K7 | **No handles anywhere.** The kit never says @who she is on TikTok, Instagram or YouTube, so a brand cannot check her profile. | blocker |
| K8 | **No engagement rate, no top formats, no best posting times, no demographics.** Stats already computes best times and top cut styles and `platform_videos` has likes/comments/shares/saves per video; none of it reaches the kit. | weak |
| K9 | **No way to add a figure the dashboard cannot pull** (e.g. her audience's age split from the TikTok app). The kit shows nothing instead, and there is no labelled "self-reported" path. | weak |
| K10 | **No location, no niche line, no positioning line** on the cover; the bio is the only text about her. | weak |
| K11 | **Past partners are a comma string.** No logos, no what she made, no result line; nothing comes over from deals she won. | weak |
| K12 | **No testimonials.** | weak |
| K13 | **Only 3 clips, all as heavy `<video>` elements with no poster fallback;** on the phone they render as three black boxes with spinners until tapped. | weak |
| K14 | **No content pillars or signature series.** Themes are read-only chips from the Brand Profile; she cannot edit them for the kit. | weak |
| K15 | **No view counter.** She cannot tell whether a brand opened the kit she sent. | weak |
| K16 | **No "what is missing" check.** Nothing tells her the kit has no packages, stale numbers, or no showcase before she sends it. | weak |
| K17 | **No preview.** The only way to see the kit is to save (publish) and open the public page. | weak |
| K18 | **The sticky "Save media kit" bar covers the email field** on desktop and sits on the bottom tab bar on the phone. | weak |
| K19 | **The contact button is a bare `mailto:` with "Working together: Sheila Bruce";** on a desktop without a mail app it does nothing, and the address is not shown as text to copy. | weak |
| K20 | **The printable page is `/api/public/kit/:slug/print`**, an API-looking address, not `/kit/:slug/print`. | polish |
| K21 | **"YouTube Shorts" stat header wraps to two lines on the phone** while the others fit on one, so the three columns do not line up. | polish |
| K22 | **The editor's link shows `PUBLIC_BASE_URL`** (`localhost:8787` locally even on another port); fine on production, confusing locally. | polish |
| K23 | **The public page has no page description / share preview tags**, so a pasted link shows a bare URL in Gmail and iMessage. | polish |

## Brand deals

| # | Finding | Rating |
| --- | --- | --- |
| D1 | **Nothing on the screen is about money.** No fee on any deal, no "dollars agreed", no "dollars paid", no sense of which brands actually pay creators. The front door is a finder button, not "brands to pitch this week". | blocker |
| D2 | **The pitch has no offer.** The starter asks "would you be open to a paid partnership: one video on TikTok and Instagram?" with no idea, no package, no price, no options. A talent manager never sends a pitch without a specific idea and an anchor. | blocker |
| D3 | **Only four texts exist:** first email, DM, day-5 and day-12 follow-ups. After "They replied" there is nothing: no reply to an offer, no rate proposal, no counter, no usage-rights question, no deliverables confirmation, no invoice, no payment reminder, no thank-you and rebook. Everything after the first email is on her. | blocker |
| D4 | **Inbound offers have no path.** When a brand emails her an offer, there is nowhere to paste it, nothing reads the terms, nothing warns her about perpetual usage, unpaid exclusivity, net-90 or "exposure". | blocker |
| D5 | **A won deal has no fee, no usage, no exclusivity, no payment terms and no invoice.** `terms_note` exists in the API and is never shown in the UI (a claim the code makes that the screen does not back). | blocker |
| D6 | **"Pass on it" takes no reason and hides the brand forever;** "lost" (they said no or went quiet) and "declined" (she said no) are the same thing, so nothing is learned. | weak |
| D7 | **The stage strip counts, it does not lead.** "1 Found · 1 Drafted · 1 Sent" says nothing about what to do next; no card shows its next action or when; overdue items do not rise to the top. | blocker |
| D8 | **TikTok One says "views in the last 30 days 0 of 1,000"** while the same data says 3.1K average views; `views30d` counts only posts the dashboard made, so an account that posts outside the dashboard reads as zero. A wrong claim. | blocker |
| D9 | **"FIT 96" is unexplained** and the reasons behind it are not sourced ("Sponsors creators your size": says who?). A fit line with no source is a guess on screen. | weak |
| D10 | **No budget signal.** A brand that paid three creators last month and a brand with no evidence of paying anyone look the same. | blocker |
| D11 | **Only TikTok One is tracked;** Instagram's creator marketplace, Amazon Influencer, LTK, ShopMy and the rest are not mentioned. | weak |
| D12 | **Follow-ups stop at two** and the second one reads as an ending, but the deal stays "Sent" forever with no close or "no reply" outcome. | weak |
| D13 | **The day-5 / day-12 tabs are shown before the pitch is sent**, and on a sent pitch the subject is locked while the body is still editable (inconsistent). | polish |
| D14 | **Subject line "Creator partnership idea: Brand × Sheila"** reads as a template; one subject, no alternatives. | weak |
| D15 | **No tone or length control;** Redraft gives the same thing again. | weak |
| D16 | **No "before you send" check:** nothing says the kit link, the rate, the deliverables or the timeline is missing from what she is about to send. | weak |
| D17 | **Nothing is kept of what she sent.** A redraft overwrites the pitch; there is no timeline of emails on the deal. | weak |
| D18 | **No negotiation help:** no floor, no target, no counter arithmetic, no usage or exclusivity math. | blocker |
| D19 | **No delivery management after "won":** deliverables are a date and a note, no approval rounds, no posting window, no reporting email to the brand after 7 days, no rebook reminder. | weak |
| D20 | **No stats on how she is doing:** pitched, replied, won, average fee are not computed anywhere. | weak |
| D21 | **Agencies look like brands.** An agency contact gets the same brand pitch. | weak |
| D22 | **On the phone the brand detail opens below the stage strip and TikTok One card;** she scrolls past both every time she opens a brand. | weak |
| D23 | **The floating `?` button covers the right edge of the brand detail card** on a 1280 desktop. | polish |
| D24 | **Grammar leaks from the product word:** "Your bouquets is already in my videos" (seed copy mirrors what the starter produces with a plural product). | polish |
| D25 | **Stage names are internal words** ("Found", "Drafted") rather than what she does next. | polish |

## Fixed in

(Filled in when the overhaul lands: every row above with the commit and where to see it.)
