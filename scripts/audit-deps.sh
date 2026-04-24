#!/usr/bin/env bash
# audit-deps.sh - pnpm audit, fail on CVSS >= 7 (high/critical) unaddressed.
set -uo pipefail

echo "── audit-deps ──"

if ! command -v pnpm >/dev/null; then
  echo "  ✗ pnpm not installed"; exit 1
fi

OUT=$(pnpm audit --audit-level=high --json 2>/dev/null || true)
if [ -z "$OUT" ] || echo "$OUT" | grep -q '"vulnerabilities":{}'; then
  echo "  ✓ no high/critical CVEs"
  exit 0
fi

# pnpm audit prints a JSON summary; count vulnerabilities at high+critical
HIGH=$(echo "$OUT" | grep -oE '"high":[0-9]+' | grep -oE '[0-9]+' | head -1 || echo 0)
CRITICAL=$(echo "$OUT" | grep -oE '"critical":[0-9]+' | grep -oE '[0-9]+' | head -1 || echo 0)
HIGH=${HIGH:-0}
CRITICAL=${CRITICAL:-0}

if [ "$HIGH" -gt 0 ] || [ "$CRITICAL" -gt 0 ]; then
  echo "  ✗ $HIGH high + $CRITICAL critical CVEs unaddressed"
  echo "  · run 'pnpm audit' for details, then 'pnpm update <pkg>' or document a justified exception"
  exit 1
fi

echo "  ✓ pnpm audit clean at high+critical"
exit 0
