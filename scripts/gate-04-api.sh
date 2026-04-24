#!/usr/bin/env bash
# gate-04-api.sh - Verifies every documented endpoint exists and follows the security pattern.
# Requires the dev server running on localhost:3000.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

BASE="${BASE_URL:-http://localhost:3000}"

echo "── Gate 04: API ──"

# 1. Every documented public endpoint exists (returns something other than 404)
echo "[1/4] Public endpoints exist"
PUBLIC_ENDPOINTS="POST:/api/v1/landing/context POST:/api/v1/ask POST:/api/v1/nda/initiate POST:/api/v1/nda/verify POST:/api/v1/nda/sign GET:/api/v1/lounge POST:/api/v1/meeting/book"
for spec in $PUBLIC_ENDPOINTS; do
  M="${spec%%:*}"; P="${spec##*:}"
  S=$(curl -s -o /dev/null -w "%{http_code}" -X "$M" "$BASE$P" -H 'Content-Type: application/json' -d '{}')
  if [ "$S" != "404" ]; then pass "$M $P (HTTP $S)"; else fail "$M $P returns 404 - route missing"; fi
done

# 2. Every documented admin endpoint exists
echo "[2/4] Admin endpoints exist"
ADMIN_ENDPOINTS="POST:/api/v1/admin/auth/login POST:/api/v1/admin/auth/logout GET:/api/v1/admin/cockpit GET:/api/v1/admin/investors POST:/api/v1/admin/investors GET:/api/v1/admin/audit GET:/api/v1/admin/ai-spend POST:/api/v1/admin/pipeline/transition GET:/api/v1/admin/knowledge POST:/api/v1/admin/knowledge POST:/api/v1/admin/draft/generate POST:/api/v1/admin/draft/send POST:/api/v1/admin/batch GET:/api/v1/admin/inbox"
for spec in $ADMIN_ENDPOINTS; do
  M="${spec%%:*}"; P="${spec##*:}"
  S=$(curl -s -o /dev/null -w "%{http_code}" -X "$M" "$BASE$P" -H 'Content-Type: application/json' -d '{}')
  if [ "$S" != "404" ]; then pass "$M $P (HTTP $S)"; else fail "$M $P returns 404 - route missing"; fi
done

# 3. RFC 7807 problem+json on error
echo "[3/4] Error envelope is RFC 7807"
CT=$(curl -s -X POST "$BASE/api/v1/admin/investors" -H 'Content-Type: application/json' -d '{"junk":"data"}' -D - -o /tmp/gate04-err.json | grep -i 'content-type:' | head -1)
if echo "$CT" | grep -q 'application/problem+json'; then
  pass "errors return application/problem+json"
else
  fail "expected application/problem+json on error, got: $CT"
fi

# 4. audit-routes.sh: every route.ts has the five security layers
echo "[4/4] Five-layer security pattern enforced"
if [ -x scripts/audit-routes.sh ]; then
  if scripts/audit-routes.sh >/tmp/gate04-audit.log 2>&1; then
    pass "every route.ts has all five security layers"
  else
    fail "audit-routes.sh found violations - see /tmp/gate04-audit.log"
  fi
else
  fail "scripts/audit-routes.sh missing"
fi

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
