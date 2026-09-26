#!/usr/bin/env bash
# The e2e web server: a fresh local D1 + R2 every run (exactly like CI), migrations applied,
# then wrangler dev with fake services. Playwright starts this BEFORE globalSetup, so the
# reset has to live here, not in a setup hook.
set -euo pipefail
cd "$(dirname "$0")/../.."
# CI has no .dev.vars: wrangler reads secrets from that file, not from the process env.
if [ ! -f .dev.vars ]; then
  {
    echo "SESSION_SECRET=${SESSION_SECRET:-dev-session-secret}"
    echo "SECRETS_KEY=${SECRETS_KEY:-YcLVEjArFviauClfN6thsYumeyr3wqfUT9D2VnMNTm0=}"
    echo "JOB_SHARED_SECRET=${JOB_SHARED_SECRET:-dev-job-shared-secret}"
  } > .dev.vars
fi
# Local is "dev", never production: /healthz must say env "dev" (tests/unit/staging-env.test.ts).
# .dev.vars overrides wrangler.jsonc's vars locally; whatever ENV_NAME it had becomes dev.
{ grep -v '^ENV_NAME=' .dev.vars || true; echo "ENV_NAME=dev"; } > .dev.vars.tmp && mv .dev.vars.tmp .dev.vars
rm -rf .wrangler/state/v3/d1 .wrangler/state/v3/r2
npx wrangler d1 migrations apply sheila-creator-dashboard-db --local >/dev/null
PORT="${E2E_PORT:-8787}"
# Several worktrees run this suite side by side: each gets its own port and inspector port.
# AUTH_MODE: "code" (the email-code login) unless the caller says "open" (playwright.open.config.ts
# runs the no-login suite that way). wrangler.jsonc's top-level value is production's "open", so
# the suite always states it.
AUTH="${AUTH_MODE:-code}"
case "$AUTH" in open|code) ;; *) echo "AUTH_MODE must be open or code (got $AUTH)"; exit 1 ;; esac
exec npx wrangler dev --port "$PORT" --ip 127.0.0.1 --inspector-port "$((PORT + 1000))" --var FAKE_SERVICES:1 --var AUTH_MODE:"$AUTH"
