#!/usr/bin/env bash
# gate-07-launch.sh - The final gate. Everything must be green for production launch.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

echo "── Gate 07: Launch ──"

# 1. All earlier gates pass
echo "[1/7] All earlier gates"
for g in gate-00-foundation.sh gate-01-database.sh gate-02-auth.sh gate-03-integrations.sh gate-04-api.sh gate-05-ai.sh gate-06-frontend.sh; do
  if scripts/$g >/tmp/gate07-$g.log 2>&1; then
    pass "$g"
  else
    fail "$g failed - see /tmp/gate07-$g.log"
  fi
done

# 2. Test suite green with coverage
echo "[2/7] Tests + coverage"
if pnpm vitest run --coverage --reporter=dot >/tmp/gate07-vitest.log 2>&1; then
  pass "vitest passed"
  # Coverage summary
  if [ -f coverage/coverage-summary.json ]; then
    LINES=$(node -e "console.log(Math.floor(require('./coverage/coverage-summary.json').total.lines.pct))")
    [ "$LINES" -ge 85 ] && pass "line coverage $LINES% ≥ 85%" || fail "line coverage $LINES% below 85%"
  fi
else
  fail "vitest failed - see /tmp/gate07-vitest.log"
fi

# 3. E2E green
echo "[3/7] Playwright E2E"
if pnpm exec playwright test --reporter=line >/tmp/gate07-e2e.log 2>&1; then
  pass "all E2E specs passed"
else
  fail "E2E failed - see /tmp/gate07-e2e.log"
fi

# 4. Audit scripts
echo "[4/7] Audit scans"
for a in audit-routes.sh audit-ai.sh audit-secrets.sh audit-headers.sh audit-deps.sh audit-pii.sh; do
  if [ -x scripts/$a ]; then
    if scripts/$a >/tmp/gate07-$a.log 2>&1; then
      pass "$a clean"
    else
      fail "$a found issues - see /tmp/gate07-$a.log"
    fi
  else
    fail "scripts/$a missing"
  fi
done

# 5. End-to-end stitch
echo "[5/7] verify-stitch"
if [ -x scripts/verify-stitch.sh ]; then
  if scripts/verify-stitch.sh >/tmp/gate07-stitch.log 2>&1; then
    pass "every layer stitched end-to-end"
  else
    fail "stitch broken - see /tmp/gate07-stitch.log"
  fi
else
  fail "scripts/verify-stitch.sh missing"
fi

# 6. CI workflow exists and references all checks
echo "[6/7] CI workflow"
if [ -f .github/workflows/ci.yml ] && grep -q 'vitest' .github/workflows/ci.yml && grep -q 'playwright' .github/workflows/ci.yml && grep -q 'audit' .github/workflows/ci.yml; then
  pass "ci.yml runs vitest + playwright + audit jobs"
else
  fail "ci.yml does not reference vitest/playwright/audit"
fi

# 7. Production env vars set in Railway
echo "[7/7] Production env hint"
echo "  · MANUAL: confirm Railway production has all 28 env vars set (run: railway variables --environment production)"
echo "  · MANUAL: confirm SPF, DKIM, DMARC are green via mail-tester.com (≥ 9/10)"
echo "  · MANUAL: confirm external pentest findings (CVSS ≥ 7) are resolved"
echo "  · MANUAL: confirm counsel sign-off on NDA + privacy + terms"

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
echo ""
echo "Automated gates clear. Complete the four MANUAL items above before flipping production DNS."
