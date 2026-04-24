#!/usr/bin/env bash
# audit-routes.sh — Scans every src/app/api/**/route.ts and verifies the
# five-layer security pattern from SKILL.md §8:
#   1. handle(...) error envelope
#   2. rateLimit(...)
#   3. requireAuth(...) for admin routes / readNdaSession(...) for gated public
#      routes / explicitly marked public (tagged PUBLIC_OK below)
#   4. Zod .parse(...) for any route that accepts a body/query
#   5. audit(...) for mutating admin routes (POST/PATCH/DELETE on /admin/*)
#
# Exits non-zero if any violation is found.
set -uo pipefail

FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
ok() { echo "  ✓ $1"; }

# Routes that are intentionally public (no NDA or auth required).
PUBLIC_OK=(
  "src/app/api/health/route.ts"
  "src/app/api/v1/landing/context/route.ts"
  "src/app/api/v1/ask/route.ts"
  "src/app/api/v1/nda/initiate/route.ts"
  "src/app/api/v1/nda/verify/route.ts"
  "src/app/api/v1/nda/sign/route.ts"
  "src/app/api/v1/admin/auth/login/route.ts"
  "src/app/api/v1/admin/auth/signup/route.ts"
  "src/app/api/v1/admin/auth/logout/route.ts"
)

# Routes gated behind the NDA session cookie rather than admin auth.
NDA_GATED=(
  "src/app/api/v1/lounge/route.ts"
  "src/app/api/v1/document/[id]/route.ts"
  "src/app/api/v1/meeting/book/route.ts"
)

# Routes that re-export from another handler (skip content checks).
REEXPORT_OK=(
  "src/app/api/v1/admin/draft/generate/route.ts"
)

# Routes that are intentionally GET-only and do not mutate state.
NON_MUTATING_OK=(
  "src/app/api/v1/admin/cockpit/route.ts"
  "src/app/api/v1/admin/audit/route.ts"
  "src/app/api/v1/admin/ai-spend/route.ts"
  "src/app/api/v1/admin/inbox/route.ts"
)

contains() {
  local needle="$1"; shift
  for item in "$@"; do
    if [ "$item" = "$needle" ]; then return 0; fi
  done
  return 1
}

ROUTES=$(find src/app/api -name 'route.ts' | sort)
[ -n "$ROUTES" ] || { echo "no routes found"; exit 1; }

echo "── audit-routes.sh: scanning $(echo "$ROUTES" | wc -l) handler files ──"

for f in $ROUTES; do
  if contains "$f" "${REEXPORT_OK[@]}"; then
    ok "$f (re-export)"
    continue
  fi

  body=$(cat "$f")

  # 1. handle() wrapper
  if ! echo "$body" | grep -q "handle("; then
    fail "$f missing handle() wrapper"
    continue
  fi

  # 2. rateLimit()
  if ! echo "$body" | grep -q "rateLimit("; then
    fail "$f missing rateLimit()"
    continue
  fi

  # 3. Auth layer
  if contains "$f" "${PUBLIC_OK[@]}"; then
    : # intentionally public
  elif contains "$f" "${NDA_GATED[@]}"; then
    if ! echo "$body" | grep -q "readNdaSession\|NDA_SESSION_COOKIE\|services/lounge\|services/meeting\|services/nda"; then
      fail "$f expected NDA session gating, none detected"
      continue
    fi
  else
    if ! echo "$body" | grep -q "requireAuth("; then
      fail "$f missing requireAuth()"
      continue
    fi
  fi

  # 4. Zod validation for any route with a body/query (POST/PATCH or URL params)
  has_body_method=$(echo "$body" | grep -E "^export const (POST|PATCH|PUT|DELETE)" || true)
  has_query=$(echo "$body" | grep "searchParams" || true)
  if [ -n "$has_body_method" ] || [ -n "$has_query" ]; then
    if ! echo "$body" | grep -qE "\.parse\(|\.safeParse\("; then
      fail "$f missing Zod .parse() on body/query"
      continue
    fi
  fi

  # 5. Audit for mutating admin routes
  is_admin=$(echo "$f" | grep "/admin/" || true)
  is_mutating=$(echo "$body" | grep -E "^export const (POST|PATCH|PUT|DELETE)" || true)
  if [ -n "$is_admin" ] && [ -n "$is_mutating" ] && ! contains "$f" "${NON_MUTATING_OK[@]}"; then
    if ! echo "$body" | grep -qE "audit\(|services/(investors|pipeline|batch|nda|knowledge)"; then
      fail "$f mutating admin route has no audit() call or auditing service"
      continue
    fi
  fi

  ok "$f"
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "── all routes pass the 5-layer security check ──"
else
  echo "── $FAIL violation(s) — fix before merging ──"
  exit 1
fi
