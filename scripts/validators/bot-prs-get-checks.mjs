// A pull request opened by a workflow with GITHUB_TOKEN triggers no pull_request workflows, so
// its merge gate never runs and `land` can never see it green (Phase 0 live test, 26 Sep 2026:
// the help-screenshots PR #21 had no checks). Every workflow that runs `gh pr create` must
// dispatch check.yml on its branch, and check.yml must accept workflow_dispatch.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export default async function ({ root }) {
  const dir = path.join(root, ".github", "workflows");
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  const problems = [];
  const check = await readFile(path.join(dir, "check.yml"), "utf8");
  if (!/^\s+workflow_dispatch:/m.test(check)) problems.push(".github/workflows/check.yml: needs a workflow_dispatch trigger so bot PRs can be checked");
  let creators = 0;
  for (const f of files) {
    const text = await readFile(path.join(dir, f), "utf8");
    if (!/gh pr create/.test(text)) continue;
    creators++;
    if (!/gh workflow run check\.yml --ref/.test(text)) problems.push(`.github/workflows/${f}: opens a PR but never dispatches check.yml on its branch`);
    if (!/actions:\s*write/.test(text)) problems.push(`.github/workflows/${f}: needs permissions actions: write to dispatch check.yml`);
  }
  return { items: files.length + creators, problems };
}
