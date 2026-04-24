#!/usr/bin/env bash
# prod-lock.sh — single-pass prod environment audit + fix
# Run: bash scripts/prod-lock.sh
set -euo pipefail

WEBAPP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WEBAPP"

PROJECT_ID="c9b2a031-9593-49f3-8871-3344c7f8df43"
ENV_ID="3001b39c-beb6-4cb0-b529-e556554ed8d8"
APP_SVC_ID="0113aace-4b6b-4469-8dfa-0b872b5066fa"
PG_SVC_ID="e4328d42-d428-4df1-aa79-9117f8304898"
TOKEN=$(node -e "const c=require(process.env.APPDATA+'/railway/config.json');console.log(c.user.accessToken)" 2>/dev/null || echo "")

gql() {
  curl -s -X POST https://backboard.railway.app/graphql/v2 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$1\"}"
}

sep() { echo "────────────────────────────────────────────────────"; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Investor Wonderland — Production Environment Audit"
echo "═══════════════════════════════════════════════════════"

# ─── 1. Railway link ─────────────────────────────────────────────────────────
sep; echo "1. Railway project link"
STATUS=$(railway status 2>&1)
if echo "$STATUS" | grep -qi "investor wonderland"; then
  echo "  ✅ Linked to Investor Wonderland (prod)"
else
  echo "  ❌ Not linked — relinking now"
  railway link --project "Investor Wonderland" --environment production
  railway service link "$APP_SVC_ID"
fi

# ─── 2. Postgres plugin ───────────────────────────────────────────────────────
sep; echo "2. Postgres plugin"
PG_VARS=$(gql "{ variables(projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENV_ID\\\", serviceId: \\\"$PG_SVC_ID\\\") }")
if echo "$PG_VARS" | grep -q "DATABASE_PUBLIC_URL"; then
  PG_PUBLIC=$(echo "$PG_VARS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['variables']; print(d.get('DATABASE_PUBLIC_URL',''))" 2>/dev/null || echo "")
  echo "  ✅ Postgres plugin attached"
  echo "     Public proxy: $(echo $PG_PUBLIC | sed 's/:.*@/:***@/')"
else
  echo "  ❌ Postgres service not found or API error"
fi

# ─── 3. App service DATABASE_URL ──────────────────────────────────────────────
sep; echo "3. App service DATABASE_URL"
APP_VARS_RAW=$(railway variables 2>&1)
if echo "$APP_VARS_RAW" | grep -q "DATABASE_URL"; then
  echo "  ✅ DATABASE_URL set in Investor-Wornderland service"
else
  echo "  ❌ DATABASE_URL missing — setting reference now"
  railway variables --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
  echo "  ✅ Set DATABASE_URL to \${{Postgres.DATABASE_URL}}"
fi

# ─── 4. Required env vars ─────────────────────────────────────────────────────
sep; echo "4. Required env vars"
check_var() {
  local name=$1; local label=$2
  if echo "$APP_VARS_RAW" | grep -q "║ $name"; then
    echo "  ✅ $label"
  else
    echo "  ❌ $label — NOT SET"
    return 1
  fi
}
check_var "DATABASE_URL"       "DATABASE_URL"           || true
check_var "AUTH_SECRET"        "AUTH_SECRET"            || true
check_var "SMTP_HOST"          "SMTP_HOST (Zoho)"       || true
check_var "SMTP_PASS"          "SMTP_PASS (Zoho)"       || true
check_var "IMAP_HOST"          "IMAP_HOST (Zoho)"       || true
check_var "IMAP_PASS"          "IMAP_PASS (Zoho)"       || true
check_var "NEXT_PUBLIC_SITE_URL" "NEXT_PUBLIC_SITE_URL" || true
check_var "ANTHROPIC_API_KEY"  "ANTHROPIC_API_KEY"      || echo "     ⚠  Set this in Railway dashboard before AI features work"
check_var "R2_ACCESS_KEY_ID"   "R2_ACCESS_KEY_ID (R2)"  || echo "     ⚠  Set R2_* in Railway dashboard for document storage"

# ─── 5. .env.local ────────────────────────────────────────────────────────────
sep; echo "5. .env.local (local dev)"
if [ -f ".env.local" ]; then
  LOCAL_DB=$(grep "^DATABASE_URL=" .env.local | head -1)
  if echo "$LOCAL_DB" | grep -q "shuttle.proxy.rlwy.net"; then
    echo "  ✅ .env.local uses Railway public proxy (shuttle.proxy.rlwy.net)"
  elif echo "$LOCAL_DB" | grep -q "localhost"; then
    echo "  ⚠  .env.local still pointing to localhost — updating to Railway public proxy"
    PG_PUBLIC_CLEAN=$(echo "$PG_VARS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']['variables']; print(d.get('DATABASE_PUBLIC_URL',''))" 2>/dev/null || echo "")
    if [ -n "$PG_PUBLIC_CLEAN" ]; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$PG_PUBLIC_CLEAN|" .env.local
      echo "  ✅ Updated .env.local DATABASE_URL to public proxy"
    fi
  else
    echo "  ✅ .env.local DATABASE_URL: $LOCAL_DB"
  fi
else
  echo "  ❌ .env.local not found — run: cp .env.example .env.local and fill in values"
fi

# ─── 6. Migration runner (Railway deploy command) ────────────────────────────
sep; echo "6. Production migration runner (Railway start command)"
SVC_INFO=$(gql "{ service(id: \\\"$APP_SVC_ID\\\") { name deployments(first: 1) { edges { node { status createdAt meta { startCommand } } } } } }" 2>/dev/null || echo "{}")
DEPLOY_STATUS=$(echo "$SVC_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); edges=d.get('data',{}).get('service',{}).get('deployments',{}).get('edges',[]); node=edges[0]['node'] if edges else {}; print(node.get('status','unknown')+'|'+str(node.get('meta',{}).get('startCommand','none')))" 2>/dev/null || echo "unknown|none")
echo "  Latest deploy status: $(echo $DEPLOY_STATUS | cut -d'|' -f1)"
echo "  Start command: $(echo $DEPLOY_STATUS | cut -d'|' -f2)"

# Check for railway.toml with build/deploy commands
if [ -f "railway.toml" ]; then
  echo "  ✅ railway.toml exists"
  cat railway.toml
else
  echo "  ⚠  No railway.toml — creating one with migration + start commands"
  cat > railway.toml << 'TOML'
[build]
builder = "nixpacks"

[deploy]
startCommand = "node_modules/.bin/drizzle-kit migrate && node_modules/.bin/next start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
TOML
  echo "  ✅ Created railway.toml — migrate runs before every deploy"
fi

# ─── 7. GitHub auto-deploy ────────────────────────────────────────────────────
sep; echo "7. GitHub auto-deploy"
REPO_INFO=$(gql "{ service(id: \\\"$APP_SVC_ID\\\") { name source { repo branch } } }" 2>/dev/null || echo "{}")
REPO=$(echo "$REPO_INFO" | python3 -c "import sys,json; s=json.load(sys.stdin).get('data',{}).get('service',{}).get('source',{}); print(s.get('repo','none')+'|'+s.get('branch','none'))" 2>/dev/null || echo "none|none")
REPO_NAME=$(echo $REPO | cut -d'|' -f1)
BRANCH=$(echo $REPO | cut -d'|' -f2)
if [ "$REPO_NAME" = "none" ] || [ -z "$REPO_NAME" ]; then
  echo "  ⚠  GitHub repo not connected in Railway service"
  echo "     Connect in Railway dashboard: Investor-Wornderland → Settings → Source"
  echo "     Repo: muralimailbox-glitch/Investor-Wornderland  Branch: main"
else
  echo "  ✅ GitHub repo connected: $REPO_NAME (branch: $BRANCH)"
fi

# ─── 8. Commit railway.toml if created ───────────────────────────────────────
sep; echo "8. Committing railway.toml"
if git status --short | grep -q "railway.toml"; then
  git add railway.toml
  git commit -m "chore(deploy): add railway.toml with migrate-on-deploy and healthcheck

Runs drizzle-kit migrate before next start on every Railway deploy so
schema stays in sync without a separate release phase.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  git push origin setup/investor-schema
  echo "  ✅ railway.toml committed and pushed to setup/investor-schema"
else
  echo "  ✅ railway.toml already tracked (no new commit needed)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Audit complete. See ⚠ items above for manual steps."
echo "  Manual steps required in Railway dashboard:"
echo "    1. Set ANTHROPIC_API_KEY (AI concierge won't work without it)"
echo "    2. Set R2_* vars (document uploads won't work without it)"
echo "    3. Connect GitHub repo if not auto-detected (step 7 above)"
echo "═══════════════════════════════════════════════════════"
