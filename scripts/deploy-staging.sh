#!/usr/bin/env bash
# Staging deploy = the public SAMPLE (owner, 26 Sep 2026): wrangler.jsonc env.staging, Worker
# `samplestudio` at https://samplestudio.seq-taylor.workers.dev, no login (AUTH_MODE "open"),
# FAKE_SERVICES "1" (every vendor is a stand-in, nothing real can post or spend), its own D1 + R2.
# Sheila's production stays untouched. Mirrors deploy-production.sh; never a bare `wrangler deploy`.
#
# Unlike production, the sample needs no --var overrides: env.staging states FAKE_SERVICES "1" and
# its own PUBLIC_BASE_URL, and scripts/validators/envs-match.mjs pins both (and refuses a --var
# FAKE_SERVICES override on this line, so the sample can never be flipped to real services here).
# The demo data is not part of the deploy: RUNBOOK "Sample" says how it is loaded or reset, and
# it survives every deploy in the sample's D1.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/wrangler-retry.sh
source scripts/lib/wrangler-retry.sh

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-8d147e242033699dd37c6f5a451f48d2}"
PUBLIC_BASE_URL="https://samplestudio.seq-taylor.workers.dev"

echo "==> twin check"
node scripts/validate.mjs envs-match

echo "==> build client"
npm run build

echo "==> D1 migrations (remote, staging = the sample)"
wr d1 migrations apply sheila-creator-dashboard-db-staging --remote --env staging

echo "==> deploy worker (staging = the sample)"
wr deploy --env staging

echo "==> smoke"
body=""
for i in 1 2 3 4 5 6; do
  body="$(curl -s "$PUBLIC_BASE_URL/healthz" || true)"
  case "$body" in *'"env":"sample"'*) break ;; esac
  sleep 5
done
echo "$body"
case "$body" in
  *'"ok":true'*'"fake":true'*'"env":"sample"'*) ;;
  *) echo "healthz did not report {ok:true, fake:true, env:sample}"; exit 1 ;;
esac
# The sample has no login: /api/me answers as the owner with no cookie and /api/auth/* is a 404.
bash scripts/auth-mode-smoke.sh "$PUBLIC_BASE_URL" "$(node scripts/auth-mode.mjs staging)"
echo "deployed: $PUBLIC_BASE_URL"
