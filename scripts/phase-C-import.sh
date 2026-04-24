#!/usr/bin/env bash
# phase-C-import.sh
# Runs the investor bulk-import from a JSON or CSV file.
# Dry-runs first; asks for confirmation before writing to Railway Postgres.
#
# Usage:
#   IMPORT_FILE=investors.json bash scripts/phase-C-import.sh
#   IMPORT_FILE=investors.csv  bash scripts/phase-C-import.sh
#
# Optional:
#   SKIP_CONFIRM=1  bash scripts/phase-C-import.sh   (non-interactive, no prompt)
set -euo pipefail

WEBAPP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WEBAPP_DIR"

IMPORT_FILE="${IMPORT_FILE:-}"
if [ -z "$IMPORT_FILE" ]; then
  echo "✗ IMPORT_FILE not set."
  echo "  Usage: IMPORT_FILE=investors.json bash scripts/phase-C-import.sh"
  exit 1
fi

if [ ! -f "$IMPORT_FILE" ]; then
  echo "✗ File not found: $IMPORT_FILE"
  exit 1
fi

# Detect format
EXT="${IMPORT_FILE##*.}"
if [ "$EXT" = "csv" ]; then
  FLAG="--csv"
else
  FLAG="--file"
fi

echo "════════════════════════════════════════════════════════"
echo "  OotaOS Investor Wonderland — Investor Import"
echo "  File: $IMPORT_FILE"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Dry run ───────────────────────────────────────────────────────────
echo "▶ Step 1/2  Dry run (no writes) ..."
echo ""
pnpm tsx scripts/import-investors.ts $FLAG "$IMPORT_FILE" --dry-run
DRY_EXIT=$?

if [ $DRY_EXIT -ne 0 ]; then
  echo "✗ Dry run failed. Fix errors above before applying."
  exit 1
fi

echo ""

# ── Step 2: Confirm + apply ───────────────────────────────────────────────────
if [ "${SKIP_CONFIRM:-0}" = "1" ]; then
  CONFIRM="y"
else
  read -p "▶ Step 2/2  Apply to Railway Postgres? [y/N] " CONFIRM
fi

if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo ""
  echo "Writing to Railway Postgres ..."
  pnpm tsx scripts/import-investors.ts $FLAG "$IMPORT_FILE"
  echo ""
  echo "✓ Import complete. Verify rows in Railway dashboard or:"
  echo "  railway run psql \$DATABASE_URL -c \"SELECT COUNT(*) FROM investors;\""
else
  echo "Aborted — nothing written."
fi

echo "════════════════════════════════════════════════════════"
