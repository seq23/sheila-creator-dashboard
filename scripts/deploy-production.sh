#!/usr/bin/env bash
# Production deploy — the ONLY way this Worker reaches production. `land` calls this.
# Builds the client fresh (a bare `wrangler deploy` would ship whatever is in dist/),
# applies D1 migrations, then deploys with FAKE_SERVICES=0.
#
# Why the var override: wrangler.jsonc keeps FAKE_SERVICES=1 so `wrangler dev` and CI never
# touch a real vendor. Production flips it here, in one place, and the deploy refuses to run
# if the account id is missing (the 7403 trap, see ~/bin/land).
set -euo pipefail
cd "$(dirname "$0")/.."

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-8d147e242033699dd37c6f5a451f48d2}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://sheila-creator-dashboard.sltaylor.workers.dev}"

echo "==> build client"
npm run build

echo "==> D1 migrations (remote)"
npx wrangler d1 migrations apply sheila-creator-dashboard-db --remote

echo "==> deploy worker"
npx wrangler deploy --var FAKE_SERVICES:0 --var PUBLIC_BASE_URL:"$PUBLIC_BASE_URL"

echo "==> smoke"
code="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE_URL/healthz")"
[ "$code" = "200" ] || { echo "healthz returned $code"; exit 1; }
curl -s "$PUBLIC_BASE_URL/healthz"; echo
echo "deployed: $PUBLIC_BASE_URL"
