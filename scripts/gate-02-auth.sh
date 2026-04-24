#!/usr/bin/env bash
# gate-02-auth.sh - Verifies auth flow, security headers, rate limit, audit logging.
# Requires the dev server to be running (pnpm dev) on localhost:3000.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

BASE="${BASE_URL:-http://localhost:3000}"

echo "── Gate 02: Auth + Security ──"

# 1. Required source files
echo "[1/5] Required auth source files"
for f in src/lib/auth/lucia.ts src/lib/auth/guard.ts src/lib/auth/password.ts src/lib/auth/totp.ts src/middleware.ts src/lib/security/rate-limit.ts src/lib/audit/index.ts; do
  [ -f "$f" ] && pass "$f" || fail "missing $f"
done

# 2. Server reachable
echo "[2/5] Server reachable"
if curl -sf -o /dev/null "$BASE/api/health"; then
  pass "$BASE/api/health responds"
else
  fail "$BASE/api/health unreachable - is 'pnpm dev' running?"
  echo ""; echo "── Result: $PASS passed, $FAIL failed ──"; exit 1
fi

# 3. Security headers present
echo "[3/5] Security headers"
HEADERS=$(curl -sI "$BASE/")
for h in "Strict-Transport-Security" "X-Content-Type-Options: nosniff" "X-Frame-Options: DENY" "Referrer-Policy" "Permissions-Policy" "Content-Security-Policy"; do
  if echo "$HEADERS" | grep -iq "$h"; then pass "header present: $h"; else fail "header missing: $h"; fi
done

# 4. Unauthenticated admin route returns 401
echo "[4/5] Auth gate"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/admin/cockpit")
if [ "$STATUS" = "401" ]; then pass "/api/v1/admin/cockpit returns 401 without session"; else fail "expected 401, got $STATUS"; fi

# 5. Rate limit fires on rapid login attempts
echo "[5/5] Rate limit"
HIT=0
for i in 1 2 3 4 5 6 7 8; do
  S=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/admin/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"[email protected]","password":"wrong","totpCode":"000000"}')
  [ "$S" = "429" ] && HIT=1 && break
done
[ "$HIT" = "1" ] && pass "rate limit returns 429 within 8 attempts" || fail "rate limit did not fire on 8 rapid login attempts"

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
