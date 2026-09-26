#!/usr/bin/env node
// Validator runner. Every validator in scripts/validators/ is registered in the ADMISSION
// REGISTER below with a hard-fail basis. Rule 0: a validator that checks zero items fails.
// Run: npm run validate  (or `node scripts/validate.mjs <name> …` for named validators only,
// e.g. npm run validate:envs; a name not in the register fails)
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// ADMISSION REGISTER (collision slot): one line per validator, alphabetical.
// name → why it hard-fails. A validator not listed here is refused; a listed one that is
// missing on disk fails the run.
export const REGISTER = {
  "auto-voice-silent-only": "a voice over laid on a clip where she talks drowns her own words and posts AI audio she never asked for (owner, 26 Sep 2026: clips with speech are never voiced automatically)",
  "bot-prs-get-checks": "a PR opened by a workflow gets no checks, so land can never see it green (help-screenshots PR #21, live test 26 Sep 2026)",
  "design-tokens": "a raw colour, font or off-scale size outside tokens.css is how screens drift apart (docs/design/DESIGN.md)",
  "editors-documented": "a connected editor nobody researched, or a key box for a tool with no API, sends her to a dead end (owner, 25 Sep 2026: only the most popular, honestly)",
  "envs-match": "staging is production's twin: a config drift or a job workflow without the env mapping sends staging jobs to Sheila's bucket and secret",
  "help-guides-exist": "every screen's ? button and every fix_guide slug must open a real guide (section 12c)",
  "help-pictures": "every help step must show its own picture of that step: 20 guides shared one identical picture per step number because the screenshot job fell back to the page heading (owner, 26 Sep 2026: \"the help section has the same screenshot\"); also every screen's help link, tour stop and checklist entry must open a real guide",
  "jobs-no-direct-storage": "a job holding storage keys needs an R2 token the owner cannot mint and a public repo can leak; jobs reach storage only through the Worker",
  "jobs-one-openrouter-client": "three hand-rolled OpenRouter clients in jobs each lost the end of a reasoning model's answer (live test 25 Sep 2026); one client in common.py asks again with more room",
  "jobs-registered": "every job type in the schema must have a handler or dispatch silently does nothing",
  "looks": "a Look without a description, a preview picture or test coverage is an option she picks blind, or one nothing proves renders (owner, 25 Sep 2026: clips must vary)",
  "mediakit-deals": "a kit figure without its as-of date and source tells a brand something unverifiable; an email scenario without a template or a test, a benchmark without a source, or an undocumented marketplace is a made-up claim",
  "no-content-in-logs": "public repo: a console.* outside worker/lib/log.ts can leak her content into Actions logs (section 13)",
  "nothing-hidden": "the owner's rule: nothing hidden, nothing switched off; a screen behind a flag, or a feature defaulting off, is a thing she cannot find",
  "no-secrets": "a key in the repo is public the moment it is pushed",
  "routes-mounted": "a route file nothing mounts is code that exists but nothing invokes",
  "screens-registered": "every page file must be routed in App.tsx or it is unreachable",
  "steer-honored": "a chip or a note the cut job never reads is an instruction silently dropped (owner, 26 Sep 2026: on-demand control); every control must be read, mapped, honored and tested",
  "stats-no-login": "the owner's rule (25 Sep 2026): Stats never needs a Google or Meta sign-in; TikTok's zip export was refused as Excel, and a sign-in-only path left the panel blank",
  "voice-engines": "a narration row without its engine, or an ElevenLabs call that drops a 401 / 402 / 429, shows her the wrong voice tag or a failure with no fallback",
  "voice-script": "the read-aloud script must stay about 3 minutes with a question and a number, and the Voice screen must show it, or her sample makes a thin voice",
  "web-research-optional": "the brand finder and the Research Brief must work with no web-research key (Firecrawl is an optional speed-up, owner 26 Sep 2026); a job or route that needs it goes silent without it",
  "workflows-dispatchable": "every job type must have an Actions workflow listening for its repository_dispatch event",
};

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "scripts", "validators");
const files = (await readdir(dir)).filter((f) => f.endsWith(".mjs")).sort();
const onDisk = new Set(files.map((f) => f.replace(/\.mjs$/, "")));
let failed = 0;
let checked = 0;

for (const name of Object.keys(REGISTER).sort()) {
  if (!onDisk.has(name)) {
    console.log(`✗ ${name}: registered but missing on disk`);
    failed++;
    continue;
  }
}
for (const name of onDisk) {
  if (!REGISTER[name]) {
    console.log(`✗ ${name}: on disk but not in the admission register (scripts/validate.mjs)`);
    failed++;
  }
}

const only = process.argv.slice(2);
for (const n of only) {
  if (!REGISTER[n]) {
    console.log(`✗ ${n}: not in the admission register`);
    failed++;
  }
}

for (const file of files) {
  const name = file.replace(/\.mjs$/, "");
  if (!REGISTER[name]) continue;
  if (only.length && !only.includes(name)) continue;
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  try {
    const r = await mod.default({ root });
    const items = Number(r?.items ?? 0);
    const problems = r?.problems ?? [];
    if (items === 0) {
      console.log(`✗ ${name}: checked 0 items (Rule 0: a validator that checks nothing is inert)`);
      failed++;
      continue;
    }
    checked += items;
    if (problems.length) {
      console.log(`✗ ${name} (${items} items):`);
      for (const p of problems) console.log(`    - ${p}`);
      failed++;
    } else {
      console.log(`✓ ${name} (${items} items)`);
    }
  } catch (e) {
    console.log(`✗ ${name}: threw ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log(`\n${only.length || Object.keys(REGISTER).length} validators, ${checked} items checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
