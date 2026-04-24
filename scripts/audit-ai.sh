#!/usr/bin/env bash
# audit-ai.sh — Enforces that the Anthropic SDK is ONLY imported from
# src/lib/ai/*. Any direct use of `anthropic.messages.create` or an
# `@anthropic-ai/sdk` import elsewhere is a defect.
set -uo pipefail

FAIL=0

# 1. SDK import outside src/lib/ai/
VIOLATIONS=$(grep -rn "@anthropic-ai/sdk" src \
  --include='*.ts' --include='*.tsx' \
  | grep -v '^src/lib/ai/' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "✗ @anthropic-ai/sdk imported outside src/lib/ai/:"
  echo "$VIOLATIONS" | sed 's/^/    /'
  FAIL=1
fi

# 2. messages.create called outside src/lib/ai/
CREATE_CALLS=$(grep -rn "messages\.create(" src \
  --include='*.ts' --include='*.tsx' \
  | grep -v '^src/lib/ai/' || true)

if [ -n "$CREATE_CALLS" ]; then
  echo "✗ messages.create called outside src/lib/ai/:"
  echo "$CREATE_CALLS" | sed 's/^/    /'
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✓ centralized Anthropic client — no leaks"
  exit 0
fi
exit 1
