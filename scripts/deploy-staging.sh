#!/usr/bin/env bash
# Staging deploy: the owner's fully real twin of production (wrangler.jsonc env.staging,
# FAKE_SERVICES=0, its own D1 + R2), for testing with throwaway accounts while Sheila's
# production stays untouched. Mirrors deploy-production.sh; never a bare `wrangler deploy`.
#
# Unlike production, staging needs no --var overrides: env.staging states FAKE_SERVICES "0"
# and its own PUBLIC_BASE_URL, and scripts/validators/envs-match.mjs keeps it production's twin.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/wrangler-retry.sh
source scripts/lib/wrangler-retry.sh

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-8d147e242033699dd37c6f5a451f48d2}"
PUBLIC_BASE_URL="https://sheila-creator-dashboard-staging.seq-taylor.workers.dev"

echo "==> twin check"
node scripts/validate.mjs envs-match

echo "==> build client"
npm run build

echo "==> D1 migrations (remote, staging)"
wr d1 migrations apply sheila-creator-dashboard-db-staging --remote --env staging

echo "==> deploy worker (staging)"
wr deploy --env staging

echo "==> smoke"
body=""
for i in 1 2 3 4 5 6; do
  body="$(curl -s "$PUBLIC_BASE_URL/healthz" || true)"
  case "$body" in *'"env":"staging"'*) break ;; esac
  sleep 5
done
echo "$body"
case "$body" in
  *'"ok":true'*'"fake":false'*'"env":"staging"'*) ;;
  *) echo "healthz did not report {ok:true, fake:false, env:staging}"; exit 1 ;;
esac
# Staging keeps the email-code login: /api/me needs a login and the login API answers.
bash scripts/auth-mode-smoke.sh "$PUBLIC_BASE_URL" "$(node scripts/auth-mode.mjs staging)"
echo "deployed: $PUBLIC_BASE_URL"
