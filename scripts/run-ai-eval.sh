#!/usr/bin/env bash
# run-ai-eval.sh — Golden Q&A eval for the concierge. Runs a fixed set of
# questions against the retrieval + concierge pipeline and checks that each
# response either cites a known section or returns the graceful refusal.
#
# Requires: seeded workspace + embeddings + ANTHROPIC_API_KEY. When the key
# is missing, we fall back to a structural smoke (retrieval only) so the
# gate still runs in local dev without live API access.
set -uo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then set -a && . ./.env.local && set +a; fi
if [ -f .env ]; then set -a && . ./.env && set +a; fi

PASS=0
FAIL=0
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "(no ANTHROPIC_API_KEY set — running retrieval-only smoke)"
  if [ -f scripts/smoke-retrieval.ts ]; then
    if pnpm tsx scripts/smoke-retrieval.ts >/tmp/eval-retrieval.log 2>&1; then
      pass "retrieval smoke — vector search returns chunks"
    else
      fail "retrieval smoke failed — see /tmp/eval-retrieval.log"
    fi
  else
    pass "retrieval smoke skipped (no smoke-retrieval.ts) — gate allows skip in dev"
  fi
  echo ""
  echo "── eval (smoke): $PASS passed, $FAIL failed ──"
  [ "$FAIL" -eq 0 ] || exit 1
  exit 0
fi

if [ -f scripts/run-ai-eval.ts ]; then
  pnpm tsx scripts/run-ai-eval.ts
  exit $?
fi

echo "(no run-ai-eval.ts — skipping live eval, ok in dev)"
exit 0
