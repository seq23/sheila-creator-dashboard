// Staging is production's twin (wrangler.jsonc env.staging), and every job dispatch says which
// deployment started it so Actions picks that deployment's bucket and shared secret.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dispatchBody } from "@worker/services/github";
import { envName } from "@worker/env";
// @ts-expect-error plain .mjs validator, no types
import envsMatch, { checkWorkflow, compareEnvs, parseJsonc } from "../../scripts/validators/envs-match.mjs";

const root = path.resolve(__dirname, "../..");
const cfg = () => parseJsonc(readFileSync(path.join(root, "wrangler.jsonc"), "utf8"));
const sig = { jobId: "job_1", nonce: "n1", ts: 1, sig: "abc" };

describe("dispatch payload carries the deployment", () => {
  it("staging says staging, with its own callback URL", () => {
    const b = dispatchBody({ ENV_NAME: "staging", PUBLIC_BASE_URL: "https://stg.example" }, "cut", sig);
    expect(b).toEqual({ event_type: "cut", client_payload: { job_id: "job_1", nonce: "n1", ts: 1, sig: "abc", worker_url: "https://stg.example", env: "staging" } });
  });

  it("production, dev and a missing ENV_NAME all say production (never an unknown env)", () => {
    for (const ENV_NAME of ["production", "dev", undefined, "Staging "]) expect(dispatchBody({ ENV_NAME, PUBLIC_BASE_URL: "https://p" }, "metrics", sig).client_payload.env).toBe("production");
  });

  it("envName reads only the three known names", () => {
    expect(envName({ ENV_NAME: "staging" })).toBe("staging");
    expect(envName({ ENV_NAME: "dev" })).toBe("dev");
    expect(envName({ ENV_NAME: undefined })).toBe("production");
    expect(envName({ ENV_NAME: "prod" })).toBe("production");
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

  it("fails when staging points at production's database or bucket, or is not fully real", () => {
    const c = cfg();
    c.env.staging.d1_databases[0].database_id = c.d1_databases[0].database_id;
    c.env.staging.r2_buckets[0].bucket_name = c.r2_buckets[0].bucket_name;
    c.env.staging.vars.FAKE_SERVICES = "1";
    const { problems } = compareEnvs(c);
    expect(problems.some((p: string) => p.includes("DB.database_id is production's"))).toBe(true);
    expect(problems.some((p: string) => p.includes("FILES.bucket_name is production's"))).toBe(true);
    expect(problems.some((p: string) => p.includes("fully real"))).toBe(true);
  });

  it("allows exactly the four var differences the twin rule names", () => {
    const c = cfg();
    const diff = Object.keys(c.vars).filter((k) => c.vars[k] !== c.env.staging.vars[k]).sort();
    expect(diff).toEqual(["ENV_NAME", "FAKE_SERVICES", "OWNER_EMAIL", "PUBLIC_BASE_URL"]);
  });

  it("fails a job workflow that hard-codes the production bucket or secret", () => {
    const buckets = { production: "p-files", staging: "s-files" };
    const bad = "on:\n  repository_dispatch:\n    types: [x]\n        env:\n          WORKER_URL: ${{ github.event.client_payload.worker_url }}\n          JOB_SHARED_SECRET: ${{ secrets.JOB_SHARED_SECRET }}\n          R2_BUCKET: p-files\n";
    const r = checkWorkflow("job-x.yml", bad, buckets);
    expect(r.skip).toBe(false);
    expect(r.problems.length).toBe(3);
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
});
