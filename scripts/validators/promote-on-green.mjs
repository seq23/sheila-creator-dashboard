// Production moves only from a sha the full e2e suite passed, and nobody has to be in the loop.
// Pins the shape of .github/workflows/e2e.yml, promote.yml and check.yml (CLAUDE.md "Deploy"):
//   e2e.yml     runs on schedule + workflow_dispatch only — never per merge (push / pull_request)
//   promote.yml triggers only on workflow_run of `e2e` (completed, main) + workflow_dispatch; its job
//               is gated on conclusion == success, checks out the e2e run's head_sha, runs the repo's
//               own deploy script, records a GitHub Deployment (environment production), never cancels
//               a deploy in progress
//   check.yml   (the merge gate) never runs the browser suite
// Each rule is one item; a missing file is a failure, not zero items.
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  const problems = [];
  const rules = [];
  const rule = (ok, why) => { rules.push(ok); if (!ok) problems.push(why); };

  if (e2e == null) problems.push("e2e.yml is missing: nothing proves the app in a browser before production");
  else {
    const t = triggers(e2e) ?? [];
    rule(!t.some((x) => /^(push|pull_request|pull_request_target|merge_group)$/.test(x)), `e2e.yml runs per merge (${t.join(", ")}): the browser suite is nightly + dispatch, never on push / pull_request (build first, test in batches)`);
    rule(t.includes("schedule"), "e2e.yml has no schedule: production would only ever move by hand");
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
    rule(/actions\/workflows\/e2e\.yml\/runs\?head_sha=/.test(promote), "promote.yml's workflow_dispatch must refuse a sha with no green e2e run");
    rule(/healthz/.test(promote), "promote.yml runs no smoke check on production's /healthz");
  }

  if (check == null) problems.push("check.yml (the merge gate) is missing");
  else {
    const runs = check.split("\n").filter((l) => /^\s*-?\s*run:/.test(l));
    rule(!runs.some((l) => /playwright|npm run e2e|help:screenshots/.test(l)), "check.yml (the merge gate) runs the browser suite: that belongs in e2e.yml, nightly");
  }

  return { items: rules.length, problems };
}
