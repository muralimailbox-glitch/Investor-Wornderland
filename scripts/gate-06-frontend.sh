#!/usr/bin/env bash
# gate-06-frontend.sh - Verifies all routes render, axe is clean, Lighthouse mobile >= 90.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

BASE="${BASE_URL:-http://localhost:3000}"

echo "── Gate 06: Frontend ──"

# 1. Public + cockpit pages return 2xx (or 401 for cockpit, which is correct)
echo "[1/4] Routes render"
PUBLIC_ROUTES="/ /ask /privacy /terms"
COCKPIT_ROUTES="/cockpit/login"
for r in $PUBLIC_ROUTES; do
  S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$r")
  if [ "$S" = "200" ]; then pass "$r → 200"; else fail "$r → $S (expected 200)"; fi
done
for r in $COCKPIT_ROUTES; do
  S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$r")
  if [ "$S" = "200" ]; then pass "$r → 200"; else fail "$r → $S"; fi
done

# 2. axe-core via Playwright
echo "[2/4] Accessibility (axe-core)"
if command -v pnpm >/dev/null && [ -f tests/e2e/a11y.spec.ts ]; then
  if pnpm exec playwright test tests/e2e/a11y.spec.ts --reporter=line >/tmp/gate06-axe.log 2>&1; then
    pass "axe-core clean on every public route"
  else
    fail "axe-core violations found - see /tmp/gate06-axe.log"
  fi
else
  fail "tests/e2e/a11y.spec.ts missing - cannot verify accessibility"
fi

# 3. Lighthouse mobile
echo "[3/4] Lighthouse mobile ≥ 90"
if command -v pnpm >/dev/null; then
  # Use a Windows-safe temp path (mktemp path gets mis-resolved by Node on Windows).
  if [ -n "${TEMP:-}" ]; then
    TMP="${TEMP}/lh-gate06-$$.json"
  elif [ -n "${TMP:-}" ]; then
    TMP="${TMP}/lh-gate06-$$.json"
  else
    TMP="/tmp/lh-gate06-$$.json"
  fi
  # chrome-launcher throws EPERM during tmp cleanup on Windows AFTER the run
  # completes and writes the JSON. Ignore the exit code and verify the artifact.
  pnpm dlx lighthouse "$BASE/" --quiet --chrome-flags="--headless=new" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path="$TMP" >/dev/null 2>&1 || true
  if [ -f "$TMP" ] && [ -s "$TMP" ]; then
    PERF=$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(Math.round((r.categories.performance.score||0)*100))" "$TMP")
    A11Y=$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(Math.round((r.categories.accessibility.score||0)*100))" "$TMP")
    [ "$PERF" -ge 90 ] && pass "performance: $PERF" || fail "performance below 90: $PERF"
    [ "$A11Y" -ge 95 ] && pass "accessibility: $A11Y" || fail "accessibility below 95: $A11Y"
    rm -f "$TMP" 2>/dev/null || true
  else
    fail "Lighthouse run failed - no JSON produced at $TMP"
  fi
else
  fail "pnpm not available for Lighthouse"
fi

# 4. No console errors during smoke run
echo "[4/4] Browser console clean (Playwright smoke)"
if [ -f tests/e2e/smoke.spec.ts ]; then
  if pnpm exec playwright test tests/e2e/smoke.spec.ts --reporter=line >/tmp/gate06-smoke.log 2>&1; then
    pass "smoke E2E green"
  else
    fail "smoke E2E failed - see /tmp/gate06-smoke.log"
  fi
else
  fail "tests/e2e/smoke.spec.ts missing"
fi

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
