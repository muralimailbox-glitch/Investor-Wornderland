#!/usr/bin/env bash
# verify-imports.sh - The single highest-leverage anti-hallucination tool.
# For a given .ts/.tsx file, parse every import and confirm it resolves.
# Usage: scripts/verify-imports.sh src/lib/services/some.ts
set -uo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <file.ts>" >&2
  exit 2
fi
FILE="$1"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 2; }

echo "── verify-imports: $FILE ──"

VIOLATIONS=0
LINE=0
while IFS= read -r line; do
  LINE=$((LINE+1))
  # Match: import ... from '...' or import('...')
  if echo "$line" | grep -qE "^[[:space:]]*import"; then
    SPEC=$(echo "$line" | grep -oE "from\s+['\"][^'\"]+['\"]" | sed -E "s/from\s+['\"]([^'\"]+)['\"]/\1/")
    [ -z "$SPEC" ] && SPEC=$(echo "$line" | grep -oE "import\(['\"][^'\"]+['\"]\)" | sed -E "s/import\(['\"]([^'\"]+)['\"]\)/\1/")
    [ -z "$SPEC" ] && continue

    # Path import (./ or ../ or @/)
    if echo "$SPEC" | grep -qE "^(\.|@/)"; then
      # Resolve @/ to src/
      RESOLVED=$(echo "$SPEC" | sed "s|^@/|src/|")
      # Relative to the file's dir
      if echo "$RESOLVED" | grep -qE "^\."; then
        DIR=$(dirname "$FILE")
        RESOLVED="$DIR/$RESOLVED"
      fi
      # Try common extensions
      FOUND=0
      for ext in "" ".ts" ".tsx" ".js" ".jsx" "/index.ts" "/index.tsx"; do
        if [ -f "${RESOLVED}${ext}" ]; then FOUND=1; break; fi
      done
      if [ $FOUND -eq 0 ]; then
        echo "  ✗ line $LINE: cannot resolve '$SPEC' → ${RESOLVED}{,.ts,.tsx,/index.ts}"
        VIOLATIONS=$((VIOLATIONS+1))
      fi
    else
      # npm package import: check node_modules/<pkg>/package.json
      PKG=$(echo "$SPEC" | awk -F/ '{ if (substr($1,1,1)=="@") print $1 "/" $2; else print $1 }')
      if [ ! -d "node_modules/$PKG" ]; then
        echo "  ✗ line $LINE: package not installed: $PKG (from import '$SPEC')"
        VIOLATIONS=$((VIOLATIONS+1))
      fi
    fi
  fi
done < "$FILE"

if [ $VIOLATIONS -eq 0 ]; then
  echo "  ✓ all imports resolve"
  exit 0
else
  echo ""
  echo "  ✗ $VIOLATIONS unresolved imports — these are hallucinations until fixed"
  exit 1
fi
