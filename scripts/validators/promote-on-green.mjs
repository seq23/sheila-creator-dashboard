// Production moves only through the production gate, and nobody has to be in the loop.
//
// SMALL CHANGES SHIP ON THE FAST CHECK (owner decision 2 Oct 2026, asked and answered). Until then
// this validator pinned "production only from a sha the full e2e suite passed", and with the suite
// on demand only a small change sat on staging waiting for a run nothing would start. The pin is
// now the stricter pair: promote.yml still fires on e2e, still turns a red run away, still deploys
// the proven sha — AND every path goes through scripts/production-gate.mjs (a green e2e on the
// sha; or a reason, check.yml green on the sha, and a suite not known red), whose own table runs
// here as items. What "large" means is defined once, in `land` (seq23/seq-bin): this repo points
// at it and restates no threshold.
//
// Pins the shape of .github/workflows/e2e.yml, promote.yml and check.yml (CLAUDE.md "Deploy"):
//   e2e.yml     runs on workflow_dispatch only — never on a timer or per merge
//   promote.yml triggers only on workflow_run of `e2e` (completed, main) + workflow_dispatch; its job
//               is gated on conclusion == success, checks out the e2e run's head_sha, runs the repo's
//               own deploy script, records a GitHub Deployment (environment production), never cancels
//               a deploy in progress
//   check.yml   (the merge gate) never runs the browser suite
// Each rule is one item; a missing file is a failure, not zero items.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { selfTest as gateSelfTest } from "../production-gate.mjs";

/** Top-level trigger names of a workflow's `on:` block (block form, inline list or scalar). */
export function triggers(yaml) {
  const lines = yaml.split("\n");
  const i = lines.findIndex((l) => /^on:/.test(l));
  if (i < 0) return null;
  const head = lines[i].replace(/^on:\s*/, "").replace(/\s+#.*$/, "").trim();
  if (head.startsWith("[")) return head.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  if (head) return [head];
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (/^\S/.test(l)) break; // next top-level key
    const m = l.match(/^  ([A-Za-z_]+):/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** The indented body of one trigger inside the `on:` block. */
export function triggerBody(yaml, name) {
  const lines = yaml.split("\n");
  const i = lines.findIndex((l) => /^on:/.test(l));
  if (i < 0) return "";
  let inside = false;
  const out = [];
  for (const l of lines.slice(i + 1)) {
    if (/^\S/.test(l)) break;
    if (new RegExp(`^  ${name}:`).test(l)) { inside = true; continue; }
    if (/^  [A-Za-z_]+:/.test(l)) inside = false;
    if (inside) out.push(l);
  }
  return out.join("\n");
}

export default async function ({ root }) {
  const dir = path.join(root, ".github", "workflows");
  const read = (f) => readFile(path.join(dir, f), "utf8").catch(() => null);
  const [e2e, promote, check] = await Promise.all([read("e2e.yml"), read("promote.yml"), read("check.yml")]);
  const gate = await readFile(path.join(root, "scripts", "production-gate.mjs"), "utf8").catch(() => null);
  // Comment lines say what the workflow means; only the lines that run can be what it does.
  const steps = (yaml) => yaml.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const problems = [];
  const rules = [];
  const rule = (ok, why) => { rules.push(ok); if (!ok) problems.push(why); };

  if (e2e == null) problems.push("e2e.yml is missing: nothing proves the app in a browser before production");
  else {
    const t = triggers(e2e) ?? [];
    rule(!t.some((x) => /^(push|pull_request|pull_request_target|merge_group)$/.test(x)), `e2e.yml runs per merge (${t.join(", ")}): the browser suite is dispatch only`);
    rule(t.length === 1 && t[0] === "workflow_dispatch", `e2e.yml must be dispatch only, found: ${t.join(", ")}`);
    rule(t.includes("workflow_dispatch"), "e2e.yml has no workflow_dispatch: land --promote --run-e2e and promote.yml's by-hand path need it");
    rule(/^name:\s*e2e\s*$/m.test(e2e), "e2e.yml must be named `e2e`: promote.yml's workflow_run and land's E2E_WF route look it up by that name");
  }

  if (promote == null) problems.push("promote.yml is missing: production waits on a person running land --promote");
  else {
    const t = (triggers(promote) ?? []).sort();
    rule(t.join(",") === "workflow_dispatch,workflow_run", `promote.yml triggers on [${t.join(", ")}]: only workflow_run of e2e + workflow_dispatch may deploy production`);
    const wr = triggerBody(promote, "workflow_run");
    rule(/workflows:\s*\[\s*e2e\s*\]/.test(wr), "promote.yml workflow_run must name workflows: [e2e] and nothing else");
    rule(/types:\s*\[\s*completed\s*\]/.test(wr), "promote.yml workflow_run must fire on types: [completed] (the conclusion is judged in the job)");
    rule(/branches:\s*\[\s*main\s*\]/.test(wr), "promote.yml workflow_run must be limited to branches: [main]");
    rule(/github\.event\.workflow_run\.conclusion\s*==\s*'success'/.test(promote), "promote.yml's job is not gated on workflow_run.conclusion == 'success': a red nightly would deploy");
    rule(/github\.event\.workflow_run\.head_sha/.test(promote), "promote.yml does not deploy the e2e run's head_sha: main's head may have moved past what was proven");
    rule(/npm run deploy:production/.test(promote), "promote.yml must deploy through `npm run deploy:production` (scripts/deploy-production.sh), never a bare wrangler deploy");
    rule(!/^\s*(-\s*)?run:.*\bwrangler deploy\b/m.test(promote), "promote.yml runs a bare `wrangler deploy` (stale client, dev bindings)");
    rule(/"environment":"production"/.test(promote) && /deployments:\s*write/.test(promote), "promote.yml must record a GitHub Deployment (environment production) with deployments: write, or land --promote cannot see what production runs");
    rule(/cancel-in-progress:\s*false/.test(promote), "promote.yml must not cancel a deploy in progress (two d1 migrations apply on one database)");
    rule(/secrets\.CLOUDFLARE_API_TOKEN\s*!=\s*''/.test(promote), "promote.yml must refuse by name when CLOUDFLARE_API_TOKEN is missing (a NAMED STOP, not a wrangler error)");
    // 2 Oct 2026. Was: "promote.yml's workflow_dispatch must refuse a sha with no green e2e run"
    // (an inline read of e2e.yml's runs). That read now lives in the gate, pinned below beside the
    // fast-check and known-red reads; here, the workflow must hand every path to it.
    const run = steps(promote);
    rule(/node scripts\/production-gate\.mjs/.test(run), "promote.yml does not run scripts/production-gate.mjs: a dispatch could deploy production with nothing checked");
    rule(!/REFUSED: no successful e2e run/.test(run), "promote.yml carries its own inline e2e check: the rule lives in scripts/production-gate.mjs, once");
    rule(/\n      sha:/.test(triggerBody(promote, "workflow_dispatch")), "promote.yml's dispatch takes no sha: the commit that was judged could not be named");
    rule(/\n      reason:/.test(triggerBody(promote, "workflow_dispatch")), "promote.yml's dispatch takes no reason: a small change (land's verdict) could never ship from here, and production would wait on a suite nothing runs");
    rule(/REASON: \$\{\{ github\.event\.inputs\.reason \}\}/.test(run), "promote.yml does not hand the dispatch reason to the gate (env REASON)");
    rule(/git merge-base --is-ancestor "\$sha" origin\/main/.test(run), "promote.yml does not require the sha to be on main");
    rule(/healthz/.test(promote), "promote.yml runs no smoke check on production's /healthz");
  }

  if (check == null) problems.push("check.yml (the merge gate) is missing");
  else {
    const runs = check.split("\n").filter((l) => /^\s*-?\s*run:/.test(l));
    rule(!runs.some((l) => /playwright|npm run e2e|help:screenshots/.test(l)), "check.yml (the merge gate) runs the browser suite: that belongs in e2e.yml on demand");
  }

  if (gate == null) problems.push("scripts/production-gate.mjs is missing: nothing decides what may reach production");
  else {
    rule(/export function decide\(/.test(gate) && /KNOWN RED/.test(gate), "scripts/production-gate.mjs no longer carries the decision (decide) or the known-red rule");
    rule(/actions\/workflows\/\$\{E2E_WF\}\/runs\?head_sha=/.test(gate), "scripts/production-gate.mjs does not check for a green e2e run on the sha");
    rule(/actions\/workflows\/\$\{FAST_WF\}\/runs\?head_sha=/.test(gate) && /GATE_FAST_WF \|\| ["']check\.yml["']/.test(gate), "scripts/production-gate.mjs does not check the fast check (check.yml) on the sha");
    rule(/seq23\/seq-bin/.test(gate), "scripts/production-gate.mjs no longer points at land (seq23/seq-bin) for what \"large\" means");
    rule(!/LAND_LARGE_|changedFiles|additions \+ deletions/.test(gate), "scripts/production-gate.mjs restates land's size rule: one definition, in land");
    // The gate's own table: every case is an item, every broken gate it must catch is an item.
    const g = gateSelfTest();
    if (g.cases === 0 || g.mutants === 0) problems.push("scripts/production-gate.mjs self-test examined nothing (Rule 0)");
    for (let i = 0; i < g.cases - g.wrong.length; i++) rules.push(true);
    for (const w of g.wrong) rule(false, `scripts/production-gate.mjs decides wrongly: ${w}`);
    for (let i = 0; i < g.mutants - g.uncaught.length; i++) rules.push(true);
    for (const u of g.uncaught) rule(false, `scripts/production-gate.mjs self-test would not catch a gate that ${u}`);
  }

  return { items: rules.length, problems };
}
