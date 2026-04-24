#!/usr/bin/env bash
# audit-secrets.sh - Scans tracked files for committed secrets.
# Uses gitleaks if available, otherwise falls back to a built-in regex sweep.
set -uo pipefail

VIOLATIONS=0

echo "── audit-secrets ──"

if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks detect --no-banner --redact --exit-code 1 >/tmp/gitleaks.log 2>&1; then
    echo "  ✓ gitleaks: no secrets found"
    exit 0
  else
    echo "  ✗ gitleaks found potential secrets:"
    cat /tmp/gitleaks.log
    exit 1
  fi
fi

# Fallback regex sweep (less thorough but better than nothing)
PATTERNS=(
  'sk-ant-[A-Za-z0-9_-]{30,}'           # Anthropic
  'AIza[0-9A-Za-z_-]{30,}'               # Google API
  '-----BEGIN (RSA |OPENSSH |EC |PGP )?PRIVATE KEY'
  'AKIA[0-9A-Z]{16}'                     # AWS access key
  'ghp_[A-Za-z0-9]{36}'                  # GitHub PAT
  'xox[baprs]-[A-Za-z0-9-]{10,}'         # Slack
  '"password"\s*:\s*"[^"]{6,}"'          # JSON password values
)

# Build a single -E pattern
COMBINED=$(IFS='|'; echo "${PATTERNS[*]}")

# Scan tracked files only, skip the skill itself, skip .env.example, skip lockfiles
FOUND=$(git ls-files 2>/dev/null | grep -vE '\.(md|lock|svg|png|jpg|gif|webp)$|^pnpm-lock|^yarn\.lock|^\.env\.example$|^scripts/audit-' \
  | xargs -I{} grep -lE "$COMBINED" {} 2>/dev/null || true)

if [ -n "$FOUND" ]; then
  echo "$FOUND" | while IFS= read -r f; do
    echo "  ✗ potential secret in: $f"
    VIOLATIONS=$((VIOLATIONS+1))
  done
  exit 1
fi

echo "  ✓ no obvious secret material in tracked files"
echo "  · install gitleaks for stronger guarantees: https://github.com/gitleaks/gitleaks"
exit 0
