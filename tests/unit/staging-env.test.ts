// Staging is production's twin in code (wrangler.jsonc env.staging) and, since 26 Sep 2026, the
// public SAMPLE: Worker `samplestudio`, no login, fake services, ENV_NAME "sample". Every job
// dispatch says which deployment started it so Actions picks that deployment's bucket and shared
// secret; the sample dispatches as "staging" (staging's secrets) and, on fakes, never dispatches.
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { dispatchBody } from "@worker/services/github";
import { dispatchEnv, envName } from "@worker/env";
// @ts-expect-error plain .mjs validator, no types
import envsMatch, { checkDeployScripts, checkWorkflow, compareEnvs, parseJsonc, REQUIRED_DEPLOYMENTS } from "../../scripts/validators/envs-match.mjs";

const root = path.resolve(__dirname, "../..");
const cfg = () => parseJsonc(readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
const sig = { jobId: "job_1", nonce: "n1", ts: 1, sig: "abc" };

describe("dispatch payload carries the deployment", () => {
  it("staging says staging, with its own callback URL", () => {
    const b = dispatchBody({ ENV_NAME: "staging", PUBLIC_BASE_URL: "https://stg.example" }, "cut", sig);
    expect(b).toEqual({ event_type: "cut", client_payload: { job_id: "job_1", nonce: "n1", ts: 1, sig: "abc", worker_url: "https://stg.example", env: "staging" } });
  });

  it("production, dev and a missing ENV_NAME all say production (never an unknown env)", () => {
    for (const ENV_NAME of ["production", "dev", undefined, "Staging ", "Sample"]) expect(dispatchBody({ ENV_NAME, PUBLIC_BASE_URL: "https://p" }, "metrics", sig).client_payload.env).toBe("production");
  });

  it("the sample dispatches as staging: it runs on staging's Worker, bucket and shared secret", () => {
    expect(dispatchBody({ ENV_NAME: "sample", PUBLIC_BASE_URL: "https://samplestudio.seq-taylor.workers.dev" }, "cut", sig).client_payload).toMatchObject({ worker_url: "https://samplestudio.seq-taylor.workers.dev", env: "staging" });
    expect(dispatchEnv({ ENV_NAME: "sample" })).toBe("staging");
    expect(dispatchEnv({ ENV_NAME: "staging" })).toBe("staging");
    for (const ENV_NAME of ["production", "dev", undefined]) expect(dispatchEnv({ ENV_NAME })).toBe("production");
  });

  it("envName reads only the four known names, and healthz says sample for the sample", () => {
    expect(envName({ ENV_NAME: "sample" })).toBe("sample");
    expect(envName({ ENV_NAME: "staging" })).toBe("staging");
    expect(envName({ ENV_NAME: "dev" })).toBe("dev");
    expect(envName({ ENV_NAME: undefined })).toBe("production");
    expect(envName({ ENV_NAME: "prod" })).toBe("production");
    expect(envName({ ENV_NAME: "Sample" })).toBe("production");
  });
});

describe("envs-match validator", () => {
  it("passes on the committed config and checks every deployed-job workflow", async () => {
    const r = await envsMatch({ root });
    expect(r.problems).toEqual([]);
    expect(r.items).toBeGreaterThanOrEqual(20);
  });

  it("parses comments without eating strings that look like comments", () => {
    expect(parseJsonc('{"a": "/api/*", // x\n "b": [1,], /* y */ "c": "//"}')).toEqual({ a: "/api/*", b: [1], c: "//" });
  });

  it("fails on a staging drift outside the allowed differences", () => {
    const c = cfg();
    c.env.staging.compatibility_flags = ["nodejs_compat", "extra"];
    c.env.staging.vars.APP_NAME = "Other";
    c.env.staging.triggers = { crons: ["0 * * * *"] };
    const { problems } = compareEnvs(c);
    expect(problems).toEqual(expect.arrayContaining(["env.staging.compatibility_flags differs from production", "env.staging var APP_NAME differs from production", "env.staging.triggers differs from production"]));
  });

  it("fails when staging points at production's database or bucket, or leaves the fakes (the sample can never post or spend)", () => {
    const c = cfg();
    c.env.staging.d1_databases[0].database_id = c.d1_databases[0].database_id;
    c.env.staging.r2_buckets[0].bucket_name = c.r2_buckets[0].bucket_name;
    c.env.staging.vars.FAKE_SERVICES = "0";
    const { problems } = compareEnvs(c);
    expect(problems.some((p: string) => p.includes("DB.database_id is production's"))).toBe(true);
    expect(problems.some((p: string) => p.includes("FILES.bucket_name is production's"))).toBe(true);
    expect(problems).toContain('env.staging is the public sample and must run on fakes: vars.FAKE_SERVICES "1" (is "0")');
  });

  it("pins each deployment: production = sheilastudio + open + real, staging = samplestudio + open + fakes at its URL", () => {
    const c = cfg();
    expect(REQUIRED_DEPLOYMENTS).toEqual({
      production: { name: "sheilastudio", ENV_NAME: "production", AUTH_MODE: "open", deployFakeServices: "0" },
      staging: { name: "samplestudio", ENV_NAME: "sample", AUTH_MODE: "open", FAKE_SERVICES: "1", PUBLIC_BASE_URL: "https://samplestudio.seq-taylor.workers.dev" },
    });
    expect(c.name).toBe("sheilastudio");
    expect(c.env.staging.name).toBe("samplestudio");
    expect(c.env.staging.vars).toMatchObject({ ENV_NAME: "sample", AUTH_MODE: "open", FAKE_SERVICES: "1", PUBLIC_BASE_URL: "https://samplestudio.seq-taylor.workers.dev" });
    const drift = cfg();
    drift.env.staging.name = "sheila-creator-dashboard-staging";
    drift.env.staging.vars.ENV_NAME = "staging";
    drift.env.staging.vars.PUBLIC_BASE_URL = "https://sheila-creator-dashboard-staging.seq-taylor.workers.dev";
    drift.name = "sheila-creator-dashboard";
    expect(compareEnvs(drift).problems).toEqual(
      expect.arrayContaining([
        'top-level name must be "sheilastudio" (is "sheila-creator-dashboard")',
        'env.staging.name must be "samplestudio", the public sample (is "sheila-creator-dashboard-staging")',
        'env.staging vars.ENV_NAME must be "sample" (is "staging")',
        'env.staging vars.PUBLIC_BASE_URL must be "https://samplestudio.seq-taylor.workers.dev" (is "https://sheila-creator-dashboard-staging.seq-taylor.workers.dev")',
      ]),
    );
  });

  it("production ships real services from its deploy script, and the staging deploy never overrides the fakes", () => {
    const production = readFileSync(path.join(root, "scripts/deploy-production.sh"), "utf8");
    const staging = readFileSync(path.join(root, "scripts/deploy-staging.sh"), "utf8");
    expect(checkDeployScripts({ production, staging })).toEqual([]);
    expect(checkDeployScripts({ production: production.replace("--var FAKE_SERVICES:0", ""), staging })).toEqual(["scripts/deploy-production.sh must deploy with --var FAKE_SERVICES:0 (production is Sheila's real dashboard)"]);
    expect(checkDeployScripts({ production, staging: staging.replace("wr deploy --env staging", "wr deploy --env staging --var FAKE_SERVICES:0") })).toEqual(["scripts/deploy-staging.sh must run `wr deploy --env staging` with no --var override (the sample stays on fakes)"]);
    expect(staging).toContain('PUBLIC_BASE_URL="https://samplestudio.seq-taylor.workers.dev"');
    expect(staging).toContain("\"env\":\"sample\"");
  });

  it("allows only the five named var differences, and the committed sample differs in exactly three (mode and fakes match production's config)", () => {
    const c = cfg();
    const diff = Object.keys(c.vars).filter((k) => c.vars[k] !== c.env.staging.vars[k]).sort();
    expect(diff).toEqual(["ENV_NAME", "OWNER_EMAIL", "PUBLIC_BASE_URL"]);
    const d = cfg();
    d.env.staging.vars.APP_NAME = "Sample Studio";
    expect(compareEnvs(d).problems).toContain("env.staging var APP_NAME differs from production");
  });

  it("fails a job workflow that hard-codes the production bucket or secret", () => {
    const buckets = { production: "p-files", staging: "s-files" };
    const bad = "on:\n  repository_dispatch:\n    types: [x]\n        env:\n          WORKER_URL: ${{ github.event.client_payload.worker_url }}\n          JOB_SHARED_SECRET: ${{ secrets.JOB_SHARED_SECRET }}\n          R2_BUCKET: p-files\n";
    const r = checkWorkflow("job-x.yml", bad, buckets);
    expect(r.skip).toBe(false);
    expect(r.problems).toEqual([
      "job-x.yml: JOB_SHARED_SECRET must pick secrets.JOB_SHARED_SECRET_STAGING when client_payload.env is 'staging'",
      "job-x.yml: JOB_ENV must come from client_payload.env",
      "job-x.yml: a job workflow must not name a bucket; storage goes through the Worker at WORKER_URL",
    ]);
  });

  it("fails a job workflow that names either bucket even without R2_BUCKET (storage goes through the Worker)", () => {
    const buckets = { production: "p-files", staging: "s-files" };
    const ok =
      "on:\n  repository_dispatch:\n    types: [x]\n        env:\n          WORKER_URL: ${{ github.event.client_payload.worker_url }}\n          JOB_ENV: ${{ github.event.client_payload.env == 'staging' && 'staging' || 'production' }}\n          JOB_SHARED_SECRET: ${{ github.event.client_payload.env == 'staging' && secrets.JOB_SHARED_SECRET_STAGING || secrets.JOB_SHARED_SECRET }}\n";
    expect(checkWorkflow("job-x.yml", ok, buckets).problems).toEqual([]);
    expect(checkWorkflow("job-x.yml", ok + "          BUCKET: s-files\n", buckets).problems).toEqual(["job-x.yml: a job workflow must not name a bucket; storage goes through the Worker at WORKER_URL"]);
  });

  it("the sample's owner identity is the West Peek address (never a login, never a mailbox); production stays Sheila's", () => {
    const c = cfg();
    expect(c.env.staging.vars.OWNER_EMAIL).toBe("sequoia@westpeek.ventures");
    expect(c.vars.OWNER_EMAIL).toBe("asheilabruceaffair@gmail.com");
  });

  it("the login-code script says the sample is open and exits 0 (no code to read)", () => {
    const out = execFileSync("node", ["scripts/staging-login-code.mjs"], { cwd: root, encoding: "utf8" });
    expect(out.trim()).toBe("the sample is open, no code: https://samplestudio.seq-taylor.workers.dev logs everyone in as the owner");
  });
});

describe("local dev says dev", () => {
  it("tests/e2e/serve.sh rewrites .dev.vars so ENV_NAME is dev, whatever it said before, and healthz reads it as dev", () => {
    const sh = readFileSync(path.join(root, "tests/e2e/serve.sh"), "utf8");
    const line = sh.split("\n").find((l) => l.includes('echo "ENV_NAME=dev"'));
    expect(line).toBeTruthy();
    const dir = mkdtempSync(path.join(tmpdir(), "scd-devvars-"));
    for (const before of ["SESSION_SECRET=x\nENV_NAME=production\n", "SESSION_SECRET=x\n"]) {
      writeFileSync(path.join(dir, ".dev.vars"), before);
      execFileSync("bash", ["-c", `set -euo pipefail; ${line}`], { cwd: dir });
      const vars = readFileSync(path.join(dir, ".dev.vars"), "utf8").split("\n").filter(Boolean);
      expect(vars).toEqual(["SESSION_SECRET=x", "ENV_NAME=dev"]);
      const envVal = vars.find((v) => v.startsWith("ENV_NAME="))!.split("=")[1];
      expect(envName({ ENV_NAME: envVal })).toBe("dev");
    }
  });
});

describe("the owner's rules are read by code, not only written down", () => {
  it("CLAUDE.md carries 'nothing waits on the owner' and the ledger's section 6 row says the monthly refresh does not stop for approval", () => {
    const claude = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    expect(claude).toMatch(/\*\*Nothing waits on the owner\.\*\*/);
    const ledger = readFileSync(path.join(root, "docs", "PHASE-LEDGER.md"), "utf8");
    const row = ledger.split("\n").find((l) => l.startsWith("| Section 6 brief crons"));
    expect(row).toContain("Nothing waits on the owner: the monthly refresh does not stop for approval, it emails and the approved brief stays live.");
  });

  it("the sample has no named stops, every doc names it by its URL and none keeps the old staging name, and no doc tells anyone to make R2 keys for jobs", () => {
    const ledger = readFileSync(path.join(root, "docs", "PHASE-LEDGER.md"), "utf8");
    const row = ledger.split("\n").find((l) => l.startsWith("| Staging |"));
    expect(row).toContain("Named stops: none.");
    expect(row).toContain("https://samplestudio.seq-taylor.workers.dev");
    const runbook = readFileSync(path.join(root, "RUNBOOK.md"), "utf8");
    const stops = runbook.split("### Sample: named stops")[1]?.split("\n### ")[0] ?? "";
    expect(stops).toMatch(/^\s*None\./);
    for (const doc of ["RUNBOOK.md", "README.md", "CLAUDE.md"]) {
      const text = readFileSync(path.join(root, doc), "utf8");
      expect(text, doc).not.toMatch(/R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2 API token/);
      expect(text, doc).toContain("https://samplestudio.seq-taylor.workers.dev");
      expect(text, doc).not.toContain("sheila-creator-dashboard-staging.seq-taylor.workers.dev");
    }
    expect(runbook).toContain("### Sample: reading a login code without a mailbox");
    expect(runbook).toContain("node scripts/seed-year.mjs --remote-sample --apply");
  });
});
