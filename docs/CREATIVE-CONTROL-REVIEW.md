# Creative control: a hostile review (26 Sep 2026)

The owner: "hostile review and figure out what influencers would need in a product like this.
Some degree of on-demand control is good and maybe a surprise-me aspect can be good too if they
don't care much."

Read as a working creator with a dump of phone footage and ten minutes, and as her talent manager
who has to answer for every post. The benchmark is what the tools creators already use let them
steer (vendor pages, checked 26 Sep 2026; sources at the end).

## What creators steer, ranked by how often they would really use it

| # | Control | How often | Who offers it | Sheila Studio before this change |
| --- | --- | --- | --- | --- |
| 1 | **Look / template** (captions + layout + brand) | Every batch | CapCut templates, Opus Clip brand template, Captions "styles", Submagic presets | 12 Looks, but only from Settings for all dumps; a note asking for one was **ignored** |
| 2 | **Must include / leave out a moment** ("the kitchen bit", "not the part where I cough") | Most batches | Opus Clip ClipAnything prompt, Descript criteria field, Captions chat | Notes reach the moment picker **only when the AI is connected**; with no OpenRouter (staging today) the note is **ignored completely**; nothing reports whether it was followed |
| 3 | **Caption style** | Most batches | All five | Per Look only; "no captions" in a note **ignored** |
| 4 | **How many clips / how long** | Often | Descript (1–20, 10 s–5 min), Opus Clip (length) | Fixed 2–3x the weekly need; recipe lengths fixed; "just 5 clips" or "keep them short" **ignored** |
| 5 | **Music / vibe** | Often | CapCut, Submagic, Captions, Descript | Her songs rotate across all clips when the switch is on; "no music" or "use my upbeat song" **ignored** |
| 6 | **Layout, incl. multi-video grids** | Often for recaps | CapCut (split screen, manual), Captions styles | Grids exist, rotated by the Worker; "all 2x4 grids" **ignored** |
| 7 | **Pace** (punchy vs calm) | Sometimes | Captions (pacing), Submagic (zoom styles), CapCut beat sync | Fixed per Look; "fast" **ignored** |
| 8 | **Platform targets** | Sometimes | Opus Clip, Descript, Submagic export presets | Per clip in Review only; "TikTok only" in a note **ignored** |
| 9 | **Re-roll / another version** | Every Review session | Opus Clip (regenerate), Captions styles, CapCut templates | Change look existed; no one-tap "try another", no "change music" |
| 10 | **Hook / title style** | Sometimes | Opus Clip (title styles) | Model writes hooks; she can swap to the alternative hook; no style choice (left for later, below) |

Not offered on purpose: AI b-roll and generated footage (locked decision: real footage only).

## Every place an instruction was silently ignored (before this change)

1. Dump notes reach only `llm_moments()` in `jobs/cut.py`. Without an OpenRouter key the
   deterministic picker runs and never reads them.
2. Looks, grids and layout come from Settings > Editing for every dump; no per-dump choice exists,
   and a note naming a look is never read.
3. Music: her songs rotate per clip when the Settings switch is on; "no music", "use my song X"
   are never read.
4. Number of clips: always 2–3x the weekly need; "5 clips" is never read.
5. Clip length: recipe bounds are fixed; "short ones" is never read.
6. Captions: per Look; "no captions" is never read.
7. Platforms: every clip goes to all three; "TikTok only" is never read.
8. Per-file notes ("Anything we should know about this one") reach only the AI prompt's
   `file_note`, and only when the AI is connected.
9. Nothing on the dump says whether a request was followed. A creator cannot tell "ignored" from
   "not possible".

## What changes (this PR)

- **Surprise me** (the default): the built-in variety, deliberately varied across the batch
  (looks and grids rotate, her songs rotate), and the dump says **What we tried** in one line.
- **I'll steer**: tap chips, no form. Look (every Look incl. the grids), Music (none, your songs,
  one song), Pace (calm, normal, fast), Clip length, How many, Captions, Platforms. An untapped
  chip stays "surprise" for that one thing.
- **Notes are read into the same controls**, the dump's and each video's, plus "must include" and
  "leave out". Rules read them every time (no AI needed); when the free AI is connected it reads
  them too and fills what the rules missed. **Here's what we understood** shows under the note
  before she presses Dump.
- **Never silently dropped**: anything that cannot be followed (a 3x3 grid, a song she never
  uploaded, "40 clips") is still made the closest way and listed on the dump as **Not followed,
  because …**. After cutting, the job reports what it could not find ("we never heard 'kitchen'").
- **Review**: Change look (existed), **Change music**, **Try another version** (a different look,
  re-rolled).

## Left for later, with the reason

- Hook style choice (question / bold claim / story): the model writes hooks today and she can swap
  or type; a style chip needs its own quality check on the free model.
- Beat-synced cuts to her song: needs beat detection and a second cutting pass; measure demand
  first (Change music usage).

## Sources

- CapCut AutoCut: https://www.capcut.com/help/auto-cut-in-capcut
- Opus Clip ClipAnything: https://www.opus.pro/clipanything, https://help.opus.pro/docs/article/introduction-to-opusclip
- Submagic: https://www.submagic.co/, https://www.submagic.co/features/b-roll
- Captions: https://captions.ai/overview
- Descript Create Clips: https://help.descript.com/hc/en-us/articles/10119670449293-Create-clips-from-your-content
- Instagram Edits: https://about.instagram.com/blog/announcements/ai-restyle-instagram-stories
