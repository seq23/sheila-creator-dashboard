#!/usr/bin/env bash
# Production deploy — the ONLY way this Worker reaches production. `land` calls this.
# Builds the client fresh (a bare `wrangler deploy` would ship whatever is in dist/),
# applies D1 migrations, then deploys with FAKE_SERVICES=0.
#
# Why the var override: wrangler.jsonc keeps FAKE_SERVICES=1 so `wrangler dev` and CI never
# touch a real vendor. Production flips it here, in one place, and the deploy refuses to run
# if the account id is missing (the 7403 trap, see ~/bin/land).
#
# The Worker is `sheilastudio` (wrangler.jsonc name) and runs with AUTH_MODE "open": no login,
# every visitor is the owner, by her choice. The smoke below proves the app answers as the owner
# with no cookie, so a deploy that silently kept the login fails here.
set -euo pipefail
cd "$(dirname "$0")/.."

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-8d147e242033699dd37c6f5a451f48d2}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://sheilastudio.seq-taylor.workers.dev}"

echo "==> build client"
npm run build

echo "==> D1 migrations (remote)"
npx wrangler d1 migrations apply sheila-creator-dashboard-db --remote

echo "==> deploy worker"
npx wrangler deploy --var FAKE_SERVICES:0 --var PUBLIC_BASE_URL:"$PUBLIC_BASE_URL"

echo "==> smoke"
# The edge can serve the previous version for a few seconds after a deploy (25 Sep 2026: the
# first read after #9 returned the old body without "env"), so read until the new version
# answers, up to ~40 s, then judge.
body=""
for i in 1 2 3 4 5 6 7 8; do
  body="$(curl -s "$PUBLIC_BASE_URL/healthz" || true)"
  case "$body" in *'"env":"production"'*) break ;; esac
  sleep 5
done
echo "$body"
# The production Worker must say it is production and real (a staging config shipped here, or
# fakes left on, would pass a bare 200).
case "$body" in
  *'"fake":false'*'"env":"production"'*) ;;
  *) echo "healthz did not report {fake:false, env:production}"; exit 1 ;;
esac
# The login mode must be the one wrangler.jsonc states: "open" → /api/me answers with no cookie
# and the login API is gone; "code" → /api/me needs a login and the login API answers.
bash scripts/auth-mode-smoke.sh "$PUBLIC_BASE_URL" "$(node scripts/auth-mode.mjs production)"
echo "deployed: $PUBLIC_BASE_URL"
