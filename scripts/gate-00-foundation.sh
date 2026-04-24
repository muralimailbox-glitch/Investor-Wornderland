#!/usr/bin/env bash
# gate-00-foundation.sh - Verifies the project foundation is solid before any feature work.
# Exit non-zero if any check fails. Run from project root.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

echo "── Gate 00: Foundation ──"

# 1. Required files exist
echo "[1/8] Required files"
for f in package.json tsconfig.json .nvmrc .env.example .gitignore .prettierrc.json eslint.config.mjs; do
  [ -f "$f" ] && pass "$f" || fail "missing $f"
done

# 2. Node version pinned to 20.x
echo "[2/8] Node version pinned"
if grep -qE '^20' .nvmrc 2>/dev/null; then pass ".nvmrc pins Node 20"; else fail ".nvmrc must pin Node 20"; fi
if grep -q '"engines"' package.json && grep -q '"node": ">=20' package.json; then
  pass "package.json engines.node >= 20"
else
  fail "package.json must declare engines.node >= 20"
fi

# 3. TypeScript strict mode flags
echo "[3/8] TypeScript strict flags"
for flag in '"strict": true' '"noUncheckedIndexedAccess": true' '"noImplicitOverride": true' '"noUnusedLocals": true' '"exactOptionalPropertyTypes": true'; do
  if grep -q "$flag" tsconfig.json; then pass "tsconfig: $flag"; else fail "tsconfig missing $flag"; fi
done

# 4. .env.example has every required key
echo "[4/8] .env.example completeness"
REQUIRED_KEYS="DATABASE_URL ANTHROPIC_API_KEY ANTHROPIC_MODEL_CONCIERGE ANTHROPIC_MODEL_DRAFTER AI_MONTHLY_CAP_USD SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_FROM SMTP_FROM_NAME IMAP_HOST IMAP_PORT IMAP_USER IMAP_PASS R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_URL AUTH_SECRET SESSION_COOKIE_NAME GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI SENTRY_DSN NEXT_PUBLIC_SITE_URL"
for k in $REQUIRED_KEYS; do
  if grep -q "^${k}=" .env.example; then pass ".env.example: $k"; else fail ".env.example missing $k"; fi
done

# 5. No real secrets committed
echo "[5/8] No secrets in committed files"
if git ls-files 2>/dev/null | xargs grep -lE 'sk-ant-[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN ' 2>/dev/null | grep -v '.env.example' | grep -v 'gate-' | grep -v '\.md$'; then
  fail "potential secret material found in tracked files"
else
  pass "no obvious secret material in tracked files"
fi
if [ -f .env ] && git check-ignore .env >/dev/null 2>&1; then pass ".env is git-ignored"; fi
if ! git check-ignore .env >/dev/null 2>&1 && [ -f .env ]; then fail ".env exists but is NOT git-ignored"; fi

# 6. Husky pre-commit hook
echo "[6/8] Pre-commit hook"
if [ -x .husky/pre-commit ]; then pass ".husky/pre-commit exists and is executable"; else fail ".husky/pre-commit missing or not executable"; fi

# 7. CI workflow
echo "[7/8] CI workflow"
if [ -f .github/workflows/ci.yml ]; then pass ".github/workflows/ci.yml exists"; else fail ".github/workflows/ci.yml missing"; fi

# 8. Lint + typecheck
echo "[8/8] Lint + typecheck"
if command -v pnpm >/dev/null && [ -f pnpm-lock.yaml ]; then
  pnpm lint --max-warnings=0 >/dev/null 2>&1 && pass "pnpm lint clean" || fail "pnpm lint produced warnings or errors"
  pnpm typecheck >/dev/null 2>&1 && pass "pnpm typecheck clean" || fail "pnpm typecheck failed"
else
  echo "  · skipping lint/typecheck (pnpm not installed or no lockfile yet)"
fi

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
