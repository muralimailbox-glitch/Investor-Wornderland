#!/usr/bin/env bash
# phase-A-verify.sh
# One-shot verification of Railway link, env vars, and Postgres schema.
# Run with: bash scripts/phase-A-verify.sh
set -euo pipefail

WEBAPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WEBAPP_DIR"

echo "════════════════════════════════════════════════════════"
echo "  OotaOS Investor Wonderland — Setup Verification"
echo "════════════════════════════════════════════════════════"

# ── 1. Railway status ─────────────────────────────────────────────────────────
echo ""
echo "▶ 1/3  Railway project link"
railway status 2>&1 && echo "✓ Railway linked" || {
  echo "✗ Railway not linked."
  echo "  Run: railway link --project 'Investor Wonderland'"
  echo "       railway service link <Investor-Wornderland-service-id>"
  exit 1
}

# ── 2. Railway env vars ───────────────────────────────────────────────────────
echo ""
echo "▶ 2/3  Railway environment variables"
VARS=$(railway variables 2>&1)
echo "$VARS" | grep -E "(DATABASE_URL|SMTP_HOST|NEXT_PUBLIC_SITE_URL|AI_MONTHLY_CAP|ANTHROPIC_MODEL|RAILWAY_PRIVATE_DOMAIN)" || true
MISSING=""
echo "$VARS" | grep -q "ANTHROPIC_API_KEY" || MISSING+=" ANTHROPIC_API_KEY"
echo "$VARS" | grep -q "R2_ACCESS_KEY_ID"  || MISSING+=" R2_ACCESS_KEY_ID"
echo "$VARS" | grep -q "SMTP_PASS"         || MISSING+=" SMTP_PASS"
if [ -n "$MISSING" ]; then
  echo ""
  echo "⚠  Not yet set in Railway:$MISSING"
  echo "   Set in Railway dashboard → Investor-Wornderland → Variables"
fi

# ── 3. Postgres connectivity + schema ────────────────────────────────────────
echo ""
echo "▶ 3/3  Postgres connectivity and schema"
pnpm tsx scripts/db-check.ts

echo ""
echo "════════════════════════════════════════════════════════"
echo "  All checks passed."
echo "  Next: bash scripts/phase-B-pr.sh  (needs GH_TOKEN)"
echo "  Or:   IMPORT_FILE=investors.json bash scripts/phase-C-import.sh"
echo "════════════════════════════════════════════════════════"
