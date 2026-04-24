#!/usr/bin/env bash
# audit-pii.sh - Verifies PII redaction is present in logger config and Sentry init.
set -uo pipefail

VIOLATIONS=0

echo "── audit-pii ──"

# 1. Sentry init must have beforeSend / beforeBreadcrumb scrubber
SENTRY_FILES=$(find . -maxdepth 3 -name 'sentry.*.config.ts' -o -name 'sentry.*.config.js' 2>/dev/null)
if [ -n "$SENTRY_FILES" ]; then
  for f in $SENTRY_FILES; do
    if grep -qE 'beforeSend|beforeBreadcrumb' "$f"; then
      echo "  ✓ $f has PII scrubber"
    else
      echo "  ✗ $f missing beforeSend/beforeBreadcrumb scrubber"
      VIOLATIONS=$((VIOLATIONS+1))
    fi
  done
else
  echo "  · no Sentry config files yet (acceptable pre-launch only)"
fi

# 2. Logger module must redact known PII fields
if [ -f src/lib/log.ts ] || [ -f src/lib/logger.ts ]; then
  LOGGER=$(find src/lib -maxdepth 2 -name 'log*.ts' | head -1)
  for field in password totp_secret signed_pdf email mobile r2_secret; do
    if grep -q "$field" "$LOGGER" 2>/dev/null; then
      echo "  ✓ logger references redaction of: $field"
    else
      echo "  ⚠ logger has no explicit reference to $field redaction"
    fi
  done
fi

# 3. No raw req.body logged anywhere
LEAKS=$(grep -rEln 'console\.(log|info|warn|error)\([^)]*req\.body' --include='*.ts' --include='*.tsx' src/ 2>/dev/null || true)
if [ -n "$LEAKS" ]; then
  echo "$LEAKS" | while IFS= read -r f; do
    echo "  ✗ $f logs req.body raw - redact first"
    VIOLATIONS=$((VIOLATIONS+1))
  done
fi

# 4. No PII in URL query params (a known anti-pattern)
URL_LEAKS=$(grep -rEln 'searchParams\.set\([^)]*(email|password|otp|token)' --include='*.ts' --include='*.tsx' src/ 2>/dev/null || true)
if [ -n "$URL_LEAKS" ]; then
  echo "$URL_LEAKS" | while IFS= read -r f; do
    echo "  ✗ $f puts sensitive value in URL params - use POST body or signed cookie"
    VIOLATIONS=$((VIOLATIONS+1))
  done
fi

if [ $VIOLATIONS -eq 0 ]; then
  echo "  ✓ no obvious PII leakage patterns"
  exit 0
else
  echo "  ✗ $VIOLATIONS PII concerns"
  exit 1
fi
