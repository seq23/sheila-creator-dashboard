# Common brief for phase agents (25 Sep 2026 fan-out)

You are one of four agents building phases of `docs/BUILD_PLAN.md` in parallel, each in your
own git worktree on a frozen base. Read, in this order: `CLAUDE.md`, `README.md`,
`docs/BUILD_PLAN.md` (your sections), `docs/wireframes/README.md` and the `.dc.html` frames for
your screens (strip the inline styles; read them for layout, labels and states), then the
existing code you extend: `shared/`, `worker/lib/*`, `worker/services/*`, `app/components/ui.tsx`,
`app/components/Shell.tsx`, `app/pages/Dump.tsx` and `app/pages/Connect.tsx` (the reference
implementations for a screen), `worker/routes/dumps.ts` and `worker/routes/uploads.ts` (the
reference for a route module), `worker/jobs/registry.ts` + `worker/routes/jobs.ts` +
`jobs/common.py` (the job protocol).

## Setup

```bash
cd ~/GitHub/sheila-creator-dashboard
git fetch origin
git worktree add ../scd-<your-letter> -b phase/<your-branch> origin/main
cd ../scd-<your-letter>
ln -s ~/GitHub/sheila-creator-dashboard/node_modules node_modules
cp ~/GitHub/sheila-creator-dashboard/.dev.vars .dev.vars
```

Run the suites with your assigned port so the four worktrees never collide:
`E2E_PORT=<your port> npm run e2e` and `npm run check`. Never run `npm install` in the shared
node_modules unless you add a dependency; if you do, add it to `package.json` (union merge at
the end) and say so in your report.

## Rules (from CLAUDE.md, restated because they are the ones agents break)

- **Only touch the files you own** (listed in your brief) plus your collision-slot lines. If
  you believe you must edit a shared file outside your slots, stop and say so in your report
  with the exact change; do not make it.
- **Fakes first.** Every vendor call goes behind a `worker/services/<vendor>.ts` (or the job's
  Python) with a fake that also returns the failure shapes. With `FAKE_SERVICES=1` the whole
  flow must work end to end with no accounts, and the `run-fake` job endpoint must produce a
  realistic result so screens can be exercised.
- **No content in logs.** `log.*` in the Worker, `log()` in jobs; the validator refuses
  `console.*` / `print()`. Never log captions, hooks, notes, file names, emails, urls, keys.
- **Plain words** in every UI string and email. One obvious next action per screen. Every error
  is a sentence plus a `fix_guide` slug that exists in `help/guides/`.
- **Every screen keeps its `<HelpButton guide="…" />`.** Write real step content in the guides
  you own (3–8 steps, one action per step, `![Step n](/help/screenshots/<slug>-n.png)` per
  step, `last_checked` today). The screenshot files are produced by the help-screenshots job;
  you do not create images.
- **Phone first** for anything she does daily: 44 px targets, works at 390 px wide, no
  horizontal scroll. Use the existing classes in `app/styles/global.css`; add new CSS only in
  a file you own (`app/styles/<screen>.css`, imported by your page) and only with the tokens
  in `tokens.css`. Do not restyle shared components; a design pass runs after the merge.
- **Tests.** Unit tests for every pure rule you add (`tests/unit/<yours>.test.ts`), a Playwright
  spec for your screens (`tests/e2e/<yours>.spec.ts`, phone + desktop, using the shared
  `setup` session). Strengthen, never weaken, never skip. `npm run check` and `npm run e2e`
  green before you report.
- **Migrations.** Your slot number is in your brief. Additive only (new tables/columns/indexes).
- **Secrets.** Never on a command line, never in the repo. Production vendor keys are NOT
  available in this build; everything must work with fakes and degrade with a named health
  light + fix guide when a real key is missing.
- **No git operations beyond your branch.** Commit often on your branch, push it, open a PR
  titled `Phase N: <name>` with a body that lists what is live, what is scaffolded, and what
  is *not yet proven* (needs a person with the test accounts). Do NOT merge, do NOT rebase
  onto anything, do NOT run `land`. The coordinator merges all four at the end.
- **Never end a turn with something running.** Block inside one call (`gh pr checks --watch`)
  or keep working. If a CI step passes 1.5× its previous duration, cancel and investigate.

## Report format (under 40 lines)

Branch, PR number, files added/changed (grouped), what is live vs scaffolded vs not yet
proven, tests added (counts), dependencies added, any shared-file change you needed but did
not make, and the exact commands you ran for check + e2e with their result lines.
