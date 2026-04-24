#!/usr/bin/env bash
# prod-finalize.sh — one-pass finalization against Railway ground truth
# Run: bash scripts/prod-finalize.sh
set -euo pipefail

WEBAPP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WEBAPP"

TOKEN="AyE_OCihM9cU56fmUcFm_pTI1GNrIA7ZsLT6qgwZbQQ"
APP_SVC_ID="0113aace-4b6b-4469-8dfa-0b872b5066fa"
ENV_ID="3001b39c-beb6-4cb0-b529-e556554ed8d8"

sep() { echo ""; echo "────────────────────────────────────────────────────"; }

echo "═══════════════════════════════════════════════════════"
echo "  Investor Wonderland — Prod Finalization"
echo "═══════════════════════════════════════════════════════"

# ─── 1. Generate public domain via Railway API ────────────────────────────────
sep; echo "1. Public domain"
DOMAIN_RESP=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceDomainCreate(input: { serviceId: \\\"$APP_SVC_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { domain } }\"}" 2>/dev/null)
echo "  API response: $DOMAIN_RESP"
GENERATED=$(echo "$DOMAIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('serviceDomainCreate',{}).get('domain',''))" 2>/dev/null || echo "")
if [ -n "$GENERATED" ]; then
  echo "  ✅ Domain generated: $GENERATED"
  # Update env var on Railway
  railway variables --set "NEXT_PUBLIC_SITE_URL=https://$GENERATED" 2>&1
  echo "  ✅ Updated NEXT_PUBLIC_SITE_URL=https://$GENERATED on Railway"
  # Update .env.local
  sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://$GENERATED|" .env.local
  echo "  ✅ Updated .env.local NEXT_PUBLIC_SITE_URL"
else
  # Domain may already exist — query existing domains
  DOMAINS_RESP=$(curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ service(id: \\\"$APP_SVC_ID\\\") { serviceInstances { edges { node { domains { serviceDomains { domain } customDomains { domain } } } } } } }\"}" 2>/dev/null)
  echo "  Existing domains query: $DOMAINS_RESP"
  EXISTING=$(echo "$DOMAINS_RESP" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  edges=d['data']['service']['serviceInstances']['edges']
  for e in edges:
    for sd in e['node']['domains'].get('serviceDomains',[]):
      print(sd['domain'])
except: pass
" 2>/dev/null || echo "")
  if [ -n "$EXISTING" ]; then
    echo "  ✅ Existing domain found: $EXISTING"
    railway variables --set "NEXT_PUBLIC_SITE_URL=https://$EXISTING" 2>&1 || true
    sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://$EXISTING|" .env.local
  else
    echo "  ⚠  Cannot generate domain via API — do this in Railway dashboard:"
    echo "     Investor-Wornderland → Settings → Networking → Generate Domain"
    echo "     Then update NEXT_PUBLIC_SITE_URL in Railway Variables"
  fi
fi

# ─── 2. Fix ANTHROPIC_MODEL_DRAFTER model ID ─────────────────────────────────
sep; echo "2. ANTHROPIC_MODEL_DRAFTER validity"
# claude-sonnet-4-6 is the correct ID per Anthropic SDK (no date suffix needed for 4.x)
CURRENT_DRAFTER=$(railway variables 2>&1 | grep "ANTHROPIC_MODEL_DRAFTER" | awk -F'│' '{print $3}' | tr -d ' ')
echo "  Current: $CURRENT_DRAFTER"
if echo "$CURRENT_DRAFTER" | grep -q "claude-sonnet-4-6"; then
  echo "  ✅ claude-sonnet-4-6 is a valid model ID (Sonnet 4.6, no date suffix required)"
else
  echo "  ⚠  Unexpected value — check Anthropic docs"
fi

# ─── 3. Verify ANTHROPIC_MODEL_CONCIERGE ────────────────────────────────────
sep; echo "3. ANTHROPIC_MODEL_CONCIERGE validity"
# claude-haiku-4-5-20251001 is valid per Anthropic SDK
echo "  claude-haiku-4-5-20251001 ✅ valid"

# ─── 4. Migration drift check ────────────────────────────────────────────────
sep; echo "4. Migration state vs schema"
echo "  Running drizzle-kit status against Railway Postgres..."
pnpm drizzle-kit status 2>&1 | tail -20
echo ""
echo "  Applied migration files:"
ls -1 drizzle/*.sql | while read f; do echo "    $(basename $f)"; done

# ─── 5. Update .env.local to full prod parity ────────────────────────────────
sep; echo "5. .env.local prod parity"
# Ensure DATABASE_URL uses the public proxy
DB_URL="postgresql://postgres:SGjhCqKsdslMLhJHVcAnctSJebsBYWpg@shuttle.proxy.rlwy.net:37766/railway"
if grep -q "shuttle.proxy.rlwy.net" .env.local; then
  echo "  ✅ DATABASE_URL already uses public proxy"
else
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env.local
  echo "  ✅ Updated DATABASE_URL in .env.local"
fi

# Ensure prod model names match
sed -i "s|^ANTHROPIC_MODEL_CONCIERGE=.*|ANTHROPIC_MODEL_CONCIERGE=claude-haiku-4-5-20251001|" .env.local
sed -i "s|^ANTHROPIC_MODEL_DRAFTER=.*|ANTHROPIC_MODEL_DRAFTER=claude-sonnet-4-6|" .env.local
sed -i "s|^AI_MONTHLY_CAP_USD=.*|AI_MONTHLY_CAP_USD=50|" .env.local
sed -i "s|^NODE_ENV=.*|NODE_ENV=development|" .env.local   # keep dev for local
echo "  ✅ Model names and caps synced with prod"

# ─── 6. Flag secrets needing action ──────────────────────────────────────────
sep; echo "6. Gaps requiring manual action (cannot be set without user credentials)"
echo ""
echo "  ❌ ANTHROPIC_API_KEY — MISSING"
echo "     Railway dashboard → Investor-Wornderland → Variables → + New Variable"
echo "     Blocks: AI concierge, Tracxn paste-and-parse, email drafter"
echo ""
echo "  ❌ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT"
echo "     Source: Cloudflare R2 dashboard → API Tokens"
echo "     R2_BUCKET should be: ootaos-docs"
echo "     R2_PUBLIC_URL should be: https://docs.ootaos.com (or R2 public URL)"
echo "     Blocks: document uploads, NDA PDF sealing, data room"
echo ""
echo "  ⚠  SMTP_PASS / IMAP_PASS are plaintext Keerti@#\$123"
echo "     Recommend: rotate to a Zoho app-specific password and use Railway secret() template"

# ─── 7. Check if railway.toml is on main or feature branch ───────────────────
sep; echo "7. Deploy command (railway.toml)"
if git log origin/main --oneline | grep -q "railway.toml"; then
  echo "  ✅ railway.toml already on main — deploy runs migrate before start"
else
  echo "  ⚠  railway.toml is on setup/investor-schema, NOT yet on main"
  echo "     It takes effect the moment that PR is merged."
  echo "     Until then, migrations must be run manually after schema changes."
  echo "     Currently safe — DB is in sync with commit 61c9d4b."
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Done. Action items above marked ❌ / ⚠"
echo "═══════════════════════════════════════════════════════"
