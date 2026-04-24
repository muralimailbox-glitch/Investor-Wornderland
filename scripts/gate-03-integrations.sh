#!/usr/bin/env bash
# gate-03-integrations.sh - Verifies Zoho SMTP, IMAP, R2, PDF, and Anthropic.
# Set SMOKE_TEST_RECIPIENT=youremail@x.com before running for the SMTP check.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

[ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f .env.local ] && set -a && . ./.env.local && set +a
[ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f .env ] && set -a && . ./.env && set +a

echo "── Gate 03: Integrations ──"

# 1. Source modules exist
echo "[1/5] Integration modules present"
for f in src/lib/mail/smtp.ts src/lib/mail/imap.ts src/lib/storage/r2.ts src/lib/pdf/seal-nda.ts src/lib/pdf/watermark.ts src/lib/ai/client.ts; do
  [ -f "$f" ] && pass "$f" || fail "missing $f"
done

# 2. Zoho SMTP
echo "[2/5] Zoho SMTP"
if [ -x scripts/test-smtp.sh ]; then
  if scripts/test-smtp.sh >/tmp/gate03-smtp.log 2>&1; then
    pass "test-smtp.sh succeeded"
  else
    fail "test-smtp.sh failed - see /tmp/gate03-smtp.log"
  fi
else
  fail "scripts/test-smtp.sh missing or not executable"
fi

# 3. R2 round-trip
echo "[3/5] Cloudflare R2"
if [ -x scripts/test-r2.sh ]; then
  if scripts/test-r2.sh >/tmp/gate03-r2.log 2>&1; then
    pass "test-r2.sh round-trip succeeded"
  else
    fail "test-r2.sh failed - see /tmp/gate03-r2.log"
  fi
else
  fail "scripts/test-r2.sh missing"
fi

# 4. PDF generation
echo "[4/5] PDF generation"
if [ -x scripts/test-pdf.sh ]; then
  if scripts/test-pdf.sh >/tmp/gate03-pdf.log 2>&1; then
    pass "test-pdf.sh produced a valid PDF"
  else
    fail "test-pdf.sh failed - see /tmp/gate03-pdf.log"
  fi
else
  fail "scripts/test-pdf.sh missing"
fi

# 5. Anthropic ping
echo "[5/5] Anthropic API"
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  fail "ANTHROPIC_API_KEY not set"
else
  RESP=$(curl -sS -o /tmp/gate03-anthropic.json -w "%{http_code}" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    https://api.anthropic.com/v1/messages \
    -d '{"model":"claude-haiku-4-5","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}' 2>&1) || true
  if [ "$RESP" = "200" ]; then
    pass "Anthropic API reachable, key valid"
  else
    fail "Anthropic ping returned HTTP $RESP - check /tmp/gate03-anthropic.json"
  fi
fi

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
