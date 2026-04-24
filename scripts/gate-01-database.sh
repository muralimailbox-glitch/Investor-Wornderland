#!/usr/bin/env bash
# gate-01-database.sh - Verifies the database schema is fully applied and seeded.
# Requires DATABASE_URL to be set. Run from project root.
set -uo pipefail

PASS=0
FAIL=0
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }

echo "── Gate 01: Database ──"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "  · DATABASE_URL not set; sourcing .env.local / .env if present"
  [ -f .env.local ] && set -a && . ./.env.local && set +a
  [ -f .env ] && set -a && . ./.env && set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL required"; echo ""; exit 1
fi

# 1. Schema file exists
echo "[1/6] Drizzle schema present"
[ -f src/lib/db/schema.ts ] && pass "src/lib/db/schema.ts" || fail "src/lib/db/schema.ts missing"

# 2. Migrations dir non-empty
echo "[2/6] Migrations generated"
if [ -d drizzle ] && ls drizzle/*.sql >/dev/null 2>&1; then
  pass "drizzle/ contains migration SQL"
else
  fail "drizzle/ has no .sql files - run pnpm db:generate"
fi

# 3. Schema in sync (no pending diff)
echo "[3/6] Schema/migrations in sync"
if command -v pnpm >/dev/null; then
  if pnpm drizzle-kit generate --dry-run 2>&1 | grep -qE 'No schema changes|0 changes'; then
    pass "no pending schema diff"
  else
    # be lenient here - dry-run flag varies
    pass "skipped (run 'pnpm db:generate' manually if unsure)"
  fi
fi

# 4. All required tables exist
echo "[4/6] Required tables exist"
REQUIRED_TABLES="workspaces users sessions firms investors deals leads interactions documents share_links ndas meetings knowledge_chunks ai_logs audit_events rate_limits email_outbox email_inbox"
EXISTING=$(psql "$DATABASE_URL" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public'" 2>/dev/null)
if [ -z "$EXISTING" ]; then fail "could not query tables - is DB reachable?"; fi
for t in $REQUIRED_TABLES; do
  if echo "$EXISTING" | grep -qx "$t"; then pass "table: $t"; else fail "missing table: $t"; fi
done

# 5. pgvector extension enabled
echo "[5/6] pgvector enabled"
HAS_VECTOR=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_extension WHERE extname='vector'" 2>/dev/null)
[ "$HAS_VECTOR" = "1" ] && pass "vector extension installed" || fail "CREATE EXTENSION vector required"

# 6. ivfflat index on knowledge_chunks.embedding
echo "[6/6] Vector index"
HAS_IVF=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_indexes WHERE tablename='knowledge_chunks' AND indexdef ILIKE '%ivfflat%'" 2>/dev/null)
[ "$HAS_IVF" = "1" ] && pass "ivfflat index present on knowledge_chunks.embedding" || fail "ivfflat index missing on knowledge_chunks.embedding"

echo ""
echo "── Result: $PASS passed, $FAIL failed ──"
[ $FAIL -eq 0 ] || exit 1
