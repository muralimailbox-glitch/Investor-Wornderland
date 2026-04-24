#!/usr/bin/env bash
# audit-headers.sh - Curls every documented public route and verifies security headers are present.
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
VIOLATIONS=0

echo "── audit-headers ──"

REQUIRED=(
  "Strict-Transport-Security"
  "X-Content-Type-Options: nosniff"
  "X-Frame-Options: DENY"
  "Referrer-Policy"
  "Permissions-Policy"
  "Content-Security-Policy"
)

ROUTES="/ /ask /privacy /terms /api/health"

for route in $ROUTES; do
  HEADERS=$(curl -sI "$BASE$route" 2>/dev/null || true)
  if [ -z "$HEADERS" ]; then
    echo "  · $route: server unreachable, skipping"
    continue
  fi

  for h in "${REQUIRED[@]}"; do
    if ! echo "$HEADERS" | grep -iq "$h"; then
      echo "  ✗ $route: missing header '$h'"
      VIOLATIONS=$((VIOLATIONS+1))
    fi
  done

  # Powerful negative checks
  if echo "$HEADERS" | grep -iq 'Server: '; then
    SERVER_LINE=$(echo "$HEADERS" | grep -i '^Server:')
    if ! echo "$SERVER_LINE" | grep -iqE 'cloudflare|railway'; then
      echo "  ⚠ $route: Server header leaks impl: $SERVER_LINE"
    fi
  fi
  if echo "$HEADERS" | grep -iq 'X-Powered-By'; then
    echo "  ✗ $route: X-Powered-By header should be removed"
    VIOLATIONS=$((VIOLATIONS+1))
  fi
done

if [ $VIOLATIONS -eq 0 ]; then
  echo "  ✓ all required security headers present on all public routes"
  exit 0
else
  echo "  ✗ $VIOLATIONS header violations"
  exit 1
fi
