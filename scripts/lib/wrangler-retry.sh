# Sourced by scripts/deploy-production.sh and scripts/deploy-staging.sh: run wrangler, and when
# Cloudflare answers 7403 ("The given account is not valid or is not authorized to access this
# service"), wait and run it once more.
#
# Why (root cause, 26 Sep 2026; `land` #27 and #47 both stopped here): wrangler's OAuth access
# token lasts an hour. The first wrangler call after it expires refreshes it, and the very first
# API request made with the freshly issued token is sometimes refused with 403 / 7403. In
# ~/.wrangler/logs from 24 to 26 Sep, all 5 of the 403s came on a run that had just refreshed its
# token (5 of 15 refreshes); no run without a refresh ever got one, and the same command run seconds
# later with the saved token passed every time. The account id was set both times
# (CLOUDFLARE_ACCOUNT_ID defaults below and in ~/bin/land), so this is not the missing-id trap.
#
# Only 7403 is retried (up to 3 tries, 5 s then 10 s apart); any other failure stops at once.
# Every wrangler call in the deploy scripts goes through `wr` (tests/unit/deploy-scripts.test.ts).
wr() {
  local try out code
  for try in 1 2 3; do
    set +e
    out="$(npx wrangler "$@" 2>&1)"
    code=$?
    set -e
    printf '%s\n' "$out"
    if [ "$code" -eq 0 ]; then return 0; fi
    case "$out" in
      *"code: 7403"*) [ "$try" -lt 3 ] && { echo "==> Cloudflare refused a just-refreshed login (7403); trying again in $((try * 5)) s"; sleep $((try * 5)); continue; } ;;
    esac
    return "$code"
  done
  return "$code"
}
