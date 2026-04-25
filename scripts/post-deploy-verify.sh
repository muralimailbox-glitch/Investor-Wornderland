#!/usr/bin/env bash
# Post-deploy verification for OotaOS Investor Wonderland.
#
# Runs against production (or any URL passed as $1). Defaults to
# https://investors.ootaos.com. Each check is independently visible —
# failures are reported but the script continues so the operator sees
# the full picture.
#
# Usage:
#   ./scripts/post-deploy-verify.sh
#   ./scripts/post-deploy-verify.sh https://investors.ootaos.com
#   PROD_URL=https://staging.example.com ./scripts/post-deploy-verify.sh

set -u
BASE="${1:-${PROD_URL:-https://investors.ootaos.com}}"
GREEN="\033[32m"
RED="\033[31m"
DIM="\033[2m"
RESET="\033[0m"

pass=0
fail=0

check() {
  local label="$1"; shift
  if "$@"; then
    printf "%b ✓ %s%b\n" "$GREEN" "$label" "$RESET"
    pass=$((pass + 1))
  else
    printf "%b ✗ %s%b\n" "$RED" "$label" "$RESET"
    fail=$((fail + 1))
  fi
}

echo "Verifying $BASE"
echo

# 1. Root serves 200 with investor-lounge content (not founder login)
check "GET / returns 200 and investor lounge" \
  bash -c "curl -fsSL '$BASE/' | grep -q -E 'Investor Wonderland|Ask Priya|Investors don.+t read pitches'"

# 2. Logo asset is served
check "GET /brand/oota-rect-tagline.png returns 200 image/png" \
  bash -c "curl -fsSI '$BASE/brand/oota-rect-tagline.png' | grep -i -E 'content-type:.*image/png'"

# 3. /cockpit redirects to /cockpit/login (not 200 dashboard)
check "GET /cockpit (unauth) redirects to /cockpit/login" \
  bash -c "curl -fsSL -o /dev/null -w '%{url_effective}' '$BASE/cockpit' | grep -q '/cockpit/login'"

# 4. /cockpit/login serves the founder login UI with logo
check "GET /cockpit/login shows the founder login form with logo" \
  bash -c "curl -fsSL '$BASE/cockpit/login' | grep -q -E 'Founder Cockpit'"

# 5. Health endpoint
check "GET /api/health returns 200" \
  bash -c "curl -fsSI '$BASE/api/health' | head -1 | grep -q '200'"

# 6. Concierge SSE responds (no canned message expected once KB is populated)
check "POST /api/v1/ask returns model metadata (no static fallback)" \
  bash -c "curl -fsS -X POST '$BASE/api/v1/ask' \
    -H 'Content-Type: application/json' \
    -d '{\"question\":\"What is OotaOS?\",\"sessionId\":\"smoke-$(date +%s)\"}' \
    | head -c 4000 \
    | grep -q -E 'claude-(opus|sonnet|haiku)'"

# 7. Concierge does NOT return the canned no-context message (proves KB populated)
check "concierge does NOT return the canned 'no specific detail' fallback" \
  bash -c "! curl -fsS -X POST '$BASE/api/v1/ask' \
    -H 'Content-Type: application/json' \
    -d '{\"question\":\"What is OotaOS?\",\"sessionId\":\"smoke2-$(date +%s)\"}' \
    | head -c 8000 \
    | grep -q \"don't have that specific detail\""

echo
printf "%bPass: %d  Fail: %d%b\n" "$DIM" "$pass" "$fail" "$RESET"
exit $fail
