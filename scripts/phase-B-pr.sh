#!/usr/bin/env bash
# phase-B-pr.sh
# Creates the GitHub PR for branch setup/investor-schema via REST API.
#
# Requires:  GH_TOKEN environment variable (GitHub PAT with `repo` scope).
# Run with:  GH_TOKEN=ghp_xxx bash scripts/phase-B-pr.sh
set -euo pipefail

OWNER="muralimailbox-glitch"
REPO="Investor-Wornderland"
HEAD="setup/investor-schema"
BASE="main"
TITLE="feat(import): bulk investor importer + Railway Postgres wired"

BODY=$(cat <<'PRBODY'
## Summary

- **Railway linked**: project `Investor Wonderland`, service `Investor-Wornderland`, environment `production`
- **Postgres wired**: `DATABASE_URL` set to `${{Postgres.DATABASE_URL}}` (private networking); public proxy URL in `.env.local` for local migrations
- **All 4 Drizzle migrations applied** to Railway Postgres ✓
- **DB seeded**: workspace `OotaOS` + founder user created
- **`scripts/import-investors.ts`**: CLI importer — reads JSON or CSV, validates against Zod schemas, batches 50 investors/call, upserts via `bulkImport()`, supports `--dry-run`
- **`pnpm import-investors`** registered in `package.json`

## Railway env vars set

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private) |
| `SMTP_*` | Zoho India (smtp.zoho.in:465) |
| `IMAP_*` | Zoho India (imap.zoho.in:993) |
| `NEXT_PUBLIC_SITE_URL` | https://investors.ootaos.com |
| `AI_MONTHLY_CAP_USD` | 50 |

⚠️ Still needs in Railway dashboard: `ANTHROPIC_API_KEY`, `R2_*` (Cloudflare R2), `GOOGLE_CLIENT_*`

## JSON shape for the Tracxn browser task

```json
{
  "firms": [{
    "name": "Accel Partners",
    "firmType": "vc",
    "hqCity": "Palo Alto",
    "hqCountry": "US",
    "websiteUrl": "https://accel.com",
    "tracxnUrl": "https://tracxn.com/a/investor/...",
    "topSectorsInPortfolio": ["AI", "SaaS", "Restaurant-Tech"],
    "topEntryRounds": ["Seed", "Series A"],
    "tracxnScore": 72,
    "recentDeals": [{"companyName": "Acme AI", "stage": "Seed", "amountUsd": 2000000, "date": "2024-03", "sector": "AI"}]
  }],
  "investors": [{
    "firmName": "Accel Partners",
    "firstName": "Jane",
    "lastName": "Smith",
    "title": "Partner",
    "decisionAuthority": "full",
    "email": "jane@accel.com",
    "sectorInterests": ["AI", "SaaS", "Restaurant-Tech"],
    "stageInterests": ["Seed", "Series A"],
    "checkSizeMinUsd": 250000,
    "checkSizeMaxUsd": 2000000,
    "bioSummary": "Leads AI-native B2B investments."
  }]
}
```

## Test plan

- [ ] `pnpm import-investors --file <tracxn-export>.json --dry-run` — verify counts
- [ ] Re-run without `--dry-run` — verify rows in DB
- [ ] Set `ANTHROPIC_API_KEY` in Railway before testing AI concierge
- [ ] Confirm Railway deploy picks up new env vars

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PRBODY
)

if [ -z "${GH_TOKEN:-}" ]; then
  echo "✗ GH_TOKEN not set."
  echo "  Export a GitHub PAT with 'repo' scope, then re-run:"
  echo "  GH_TOKEN=ghp_xxx bash scripts/phase-B-pr.sh"
  echo ""
  echo "  Alternatively, open the PR directly at:"
  echo "  https://github.com/$OWNER/$REPO/pull/new/$HEAD"
  exit 1
fi

echo "▶ Creating PR: $HEAD → $BASE"

RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls" \
  -d "$(jq -n \
    --arg title "$TITLE" \
    --arg body "$BODY" \
    --arg head "$HEAD" \
    --arg base "$BASE" \
    '{title:$title, body:$body, head:$head, base:$base}')")

PR_URL=$(echo "$RESPONSE" | grep -o '"html_url":"[^"]*pulls/[0-9]*"' | cut -d'"' -f4)

if [ -n "$PR_URL" ]; then
  echo "✓ PR created: $PR_URL"
else
  echo "✗ PR creation failed. Response:"
  echo "$RESPONSE"
  echo ""
  echo "Open manually: https://github.com/$OWNER/$REPO/pull/new/$HEAD"
  exit 1
fi
