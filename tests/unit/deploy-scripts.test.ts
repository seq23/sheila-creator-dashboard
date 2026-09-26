// The deploy scripts and Cloudflare's 7403 (root cause in scripts/lib/wrangler-retry.sh): the
// first request with a just-refreshed wrangler login is sometimes refused. Every wrangler call in
// the deploy scripts goes through `wr`, which retries 7403 only; this runs the real helper against
// a stand-in `npx` that answers as Cloudflare did.
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPTS = ["scripts/deploy-production.sh", "scripts/deploy-staging.sh"];

describe("every wrangler call in the deploy scripts goes through wr", () => {
  for (const s of SCRIPTS) {
    it(s, () => {
      const text = readFileSync(path.join(ROOT, s), "utf8");
      expect(text).toContain("source scripts/lib/wrangler-retry.sh");
      const calls = text.split("\n").filter((l) => !l.trim().startsWith("#") && !l.includes("wrangler-retry.sh") && /\bwrangler\b/.test(l));
      expect(calls, "a bare wrangler call skips the 7403 retry").toEqual([]);
      expect(text.split("\n").filter((l) => /^wr (d1 migrations apply|deploy)\b/.test(l.trim()))).toHaveLength(2);
    });
  }
});

/** Run `wr <args>` with a stand-in npx that answers from a script of exit codes (7403 = Cloudflare's refusal). */
function runWr(answers: ("ok" | "7403" | "other")[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "wr-"));
  const count = path.join(dir, "count");
  writeFileSync(count, "0");
  const npx = path.join(dir, "npx");
  writeFileSync(
    npx,
    `#!/usr/bin/env bash
n=$(( $(cat "${count}") + 1 )); echo $n > "${count}"
case "${answers.join(" ")}" in *) set -- ${answers.join(" ")};; esac
a=\${!n:-ok}
case "$a" in
  ok) echo "applied"; exit 0 ;;
  7403) echo "✘ [ERROR] A request to the Cloudflare API failed."; echo "  The given account is not valid or is not authorized to access this service [code: 7403]"; exit 1 ;;
  *) echo "✘ [ERROR] Something else broke"; exit 2 ;;
esac
`,
  );
  chmodSync(npx, 0o755);
  const r = spawnSync("bash", ["-c", `sleep() { :; }; source scripts/lib/wrangler-retry.sh; wr d1 migrations apply db --remote`], { cwd: ROOT, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, calls: Number(readFileSync(count, "utf8").trim()) };
}

describe("wr retries Cloudflare's 7403 and nothing else", () => {
  it("7403 once, then it goes through", () => {
    const r = runWr(["7403", "ok"]);
    expect(r).toMatchObject({ code: 0, calls: 2 });
    expect(r.out).toContain("trying again in 5 s");
  });
  it("any other failure stops at once, with its own exit code", () => {
    expect(runWr(["other", "ok"])).toMatchObject({ code: 2, calls: 1 });
  });
  it("7403 three times is a real failure: it stops after three tries", () => {
    expect(runWr(["7403", "7403", "7403", "ok"])).toMatchObject({ code: 1, calls: 3 });
  });
  it("the scripts are valid bash", () => {
    for (const s of [...SCRIPTS, "scripts/lib/wrangler-retry.sh"]) execFileSync("bash", ["-n", path.join(ROOT, s)]);
  });
});
