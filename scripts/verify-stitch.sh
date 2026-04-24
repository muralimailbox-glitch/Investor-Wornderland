#!/usr/bin/env bash
# verify-stitch.sh - Verifies the chain: schema → migration → repo → service → API → client → UI → test → CI.
# Reports the LOWEST broken layer for each table so you fix root cause first.
set -uo pipefail

VIOLATIONS=0

echo "── verify-stitch ──"

# Extract table names from Drizzle schema
SCHEMA=src/lib/db/schema.ts
if [ ! -f "$SCHEMA" ]; then
  echo "  ✗ $SCHEMA missing - cannot verify stitch"
  exit 1
fi

# pgTable("name", ...) or pgTable('name', ...) - extract name argument
TABLES=$(grep -oE "pgTable\(['\"][a-z_]+['\"]" "$SCHEMA" | sed -E "s/pgTable\(['\"]([a-z_]+)['\"]/\1/" | sort -u)

if [ -z "$TABLES" ]; then
  echo "  ✗ no pgTable() declarations found in $SCHEMA"
  exit 1
fi

echo "  Tables found in schema: $(echo "$TABLES" | wc -l | tr -d ' ')"
echo ""

for table in $TABLES; do
  STITCH_OK=1

  # Layer 1: Migration exists for this table
  if ! grep -rq "CREATE TABLE.*\b${table}\b\|CREATE TABLE \"${table}\"" drizzle/ 2>/dev/null; then
    echo "  ✗ $table: no CREATE TABLE in drizzle/*.sql - run pnpm db:generate"
    STITCH_OK=0
    VIOLATIONS=$((VIOLATIONS+1))
    continue  # without a migration, downstream layers can't be evaluated
  fi

  # Layer 2: Repository exists (skip infra tables that don't need a repo)
  case "$table" in
    sessions|rate_limits|email_outbox|email_inbox|audit_events|ai_logs)
      # infra tables - may have inline access
      ;;
    *)
      REPO_FILE="src/lib/db/repos/${table}.ts"
      # Project convention: kebab-case filenames (knowledge_chunks → knowledge-chunks.ts)
      REPO_FILE_KEBAB="src/lib/db/repos/$(echo "$table" | tr '_' '-').ts"
      if [ ! -f "$REPO_FILE" ] && [ ! -f "$REPO_FILE_KEBAB" ]; then
        # Also check singular form (e.g., investor.ts)
        SINGULAR="src/lib/db/repos/$(echo "$table" | sed 's/s$//').ts"
        SINGULAR_KEBAB="src/lib/db/repos/$(echo "$table" | sed 's/s$//' | tr '_' '-').ts"
        if [ ! -f "$SINGULAR" ] && [ ! -f "$SINGULAR_KEBAB" ]; then
          echo "  ✗ $table: no repository at $REPO_FILE, $REPO_FILE_KEBAB, $SINGULAR, or $SINGULAR_KEBAB"
          STITCH_OK=0
          VIOLATIONS=$((VIOLATIONS+1))
        fi
      fi
      ;;
  esac

  # Layer 3: Service references the repo (best-effort grep)
  case "$table" in
    workspaces|users|sessions|rate_limits|audit_events|ai_logs|email_outbox|email_inbox)
      ;; # not user-facing entities
    *)
      SINGULAR=$(echo "$table" | sed 's/s$//')
      if ! grep -rq "${table}Repo\|${SINGULAR}Repo\|from.*repos/${table}\|from.*repos/${SINGULAR}" src/lib/services/ 2>/dev/null; then
        echo "  ⚠ $table: no service references its repo (may be expected for read-only)"
      fi
      ;;
  esac

  [ $STITCH_OK -eq 1 ] && echo "  ✓ $table"
done

# Cross-layer: every API route that exists has a typed client wrapper
echo ""
echo "  Checking API ↔ client wrappers..."
ROUTES=$(find src/app/api -name 'route.ts' 2>/dev/null | sed -E 's|src/app/api/v1/([^/]+).*|\1|' | sort -u)
CLIENTS=$(ls src/lib/api/*.ts 2>/dev/null | xargs -n1 basename | sed 's/\.ts$//' | sort -u)
for r in $ROUTES; do
  if ! echo "$CLIENTS" | grep -qx "$r"; then
    # admin/cockpit/inbox/etc don't all need 1:1 mapping but core ones do
    case "$r" in
      ask|nda|lounge|investors|knowledge|pipeline|inbox|cockpit)
        echo "  ✗ no typed client wrapper at src/lib/api/${r}.ts for /api/v1/${r}/*"
        VIOLATIONS=$((VIOLATIONS+1))
        ;;
    esac
  fi
done

# Cross-layer: every public route has at least one E2E spec
echo ""
echo "  Checking UI ↔ E2E coverage..."
E2E=$(find tests/e2e -name '*.spec.ts' 2>/dev/null)
if [ -z "$E2E" ]; then
  echo "  ✗ no Playwright specs in tests/e2e/"
  VIOLATIONS=$((VIOLATIONS+1))
else
  for required_spec in smoke ask nda-flow book-meeting; do
    if ! echo "$E2E" | grep -qE "${required_spec}\.spec\.ts"; then
      echo "  ⚠ tests/e2e/${required_spec}.spec.ts missing (one of the four critical journeys)"
    fi
  done
fi

echo ""
if [ $VIOLATIONS -eq 0 ]; then
  echo "  ✓ stitch intact: schema → migration → repo → service → API → client → UI → test"
  exit 0
else
  echo "  ✗ $VIOLATIONS broken stitch links - fix lowest-layer first"
  exit 1
fi
