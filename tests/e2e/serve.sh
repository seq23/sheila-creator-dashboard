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
rm -rf .wrangler/state/v3/d1 .wrangler/state/v3/r2
npx wrangler d1 migrations apply sheila-creator-dashboard-db --local >/dev/null
exec npx wrangler dev --port 8787 --ip 127.0.0.1 --var FAKE_SERVICES:1
