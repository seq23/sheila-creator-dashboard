import { defineConfig, devices } from "@playwright/test";

// The Phase 0 live suite (tests/live): drives the REAL staging dashboard with the owner's
// throwaway accounts. Not part of `npm run e2e`; run with `npm run e2e:live`. The login code is
// read back from Resend (the staging owner address has no mailbox an agent can open), and one
// session is saved and reused for the whole run: the login-code limit is 5 per 15 minutes.
// Outside test-results/: Playwright empties its output folder at the start of every run, which
// threw the saved session away (a fresh emailed code per run) and broke parallel runs' traces.
export const LIVE_STORAGE = ".live-auth/owner.json";
const BASE = process.env.LIVE_BASE_URL ?? "https://sheila-creator-dashboard-staging.seq-taylor.workers.dev";

// Production is Sheila's live app: this suite posts, deletes and disconnects. Refuse it outright.
if (!/staging|localhost|127\.0\.0\.1/.test(BASE)) throw new Error(`LIVE_BASE_URL must be staging, not ${BASE}`);

export default defineConfig({
  testDir: "tests/live",
  // one folder per run (set once in the runner, inherited by its workers): parallel live runs
  // (a 60-minute voice job beside a cut) never clean each other up
  outputDir: `test-results/live-${(process.env.LIVE_RUN_ID ??= String(process.pid))}`,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 820 },
  },
  projects: [
    { name: "live-setup", testMatch: /auth\.setup\.ts/ },
    { name: "live", dependencies: ["live-setup"], use: { storageState: LIVE_STORAGE }, testIgnore: /auth\.setup\.ts/ },
  ],
});
