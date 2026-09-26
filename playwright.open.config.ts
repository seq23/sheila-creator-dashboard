import { defineConfig, devices } from "@playwright/test";

// Open mode (AUTH_MODE "open"), the way production runs: no login, every visitor is the owner.
// Its own server (tests/e2e/serve.sh with AUTH_MODE=open, a fresh local D1) on its own port, so
// it never shares a database or a session with the code-mode suite (playwright.config.ts).
// No setup project and no stored session: the point is that nothing logs in.
const PORT = Number(process.env.E2E_PORT ?? 8789);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /open-mode\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: "test-results/open-mode",
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-open" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    storageState: { cookies: [], origins: [] },
  },
  webServer: {
    command: "bash tests/e2e/serve.sh",
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      E2E_PORT: String(PORT),
      AUTH_MODE: "open",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-session-secret",
      SECRETS_KEY: process.env.SECRETS_KEY ?? "YcLVEjArFviauClfN6thsYumeyr3wqfUT9D2VnMNTm0=",
      JOB_SHARED_SECRET: process.env.JOB_SHARED_SECRET ?? "dev-job-shared-secret",
    },
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 820 } } },
  ],
});
