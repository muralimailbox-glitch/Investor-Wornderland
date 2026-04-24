/**
 * Bulk-import investors from a JSON or CSV file into the Railway Postgres.
 * Calls bulkImport() directly — no HTTP overhead, works locally and on Railway.
 *
 * Usage:
 *   pnpm tsx scripts/import-investors.ts --file investors.json [--dry-run]
 *   pnpm tsx scripts/import-investors.ts --csv  investors.csv  [--dry-run]
 *
 * JSON shape: see "Expected JSON shape" section at the bottom of this file.
 * CSV shape:  see column definitions in parseCsvRow() below.
 *
 * The script batches 50 investors per call (API limit) and prints a tally.
 * It exits 0 on success, 1 on any error.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const BATCH_SIZE = 50;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileFlag = args.indexOf('--file');
const csvFlag = args.indexOf('--csv');
const isDryRun = args.includes('--dry-run');

const filePath = fileFlag !== -1 ? args[fileFlag + 1] : null;
const csvPath = csvFlag !== -1 ? args[csvFlag + 1] : null;

if (!filePath && !csvPath) {
  console.error('Usage: import-investors --file <path.json> [--dry-run]');
  console.error('       import-investors --csv  <path.csv>  [--dry-run]');
  process.exit(1);
}

// ── CSV parser ────────────────────────────────────────────────────────────────
// Expected columns (case-insensitive header row):
//   firm_name, firm_type, firm_hq_city, firm_hq_country, firm_website,
//   firm_linkedin_url, firm_tracxn_url, firm_founded_year,
//   investor_first_name, investor_last_name, investor_title,
//   investor_decision_authority, investor_email, investor_linkedin_url,
//   investor_city, investor_country, investor_tracxn_url,
//   investor_bio_summary, investor_check_size_min_usd, investor_check_size_max_usd,
//   sector_interests (pipe-separated), stage_interests (pipe-separated),
//   recent_deals_json (raw JSON string — optional)
function parseCsv(raw: string): { firms: unknown[]; investors: unknown[] } {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) throw new Error('CSV has no data rows');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  function col(row: string[], name: string): string {
    const idx = headers.indexOf(name);
    return idx !== -1 ? (row[idx] ?? '').trim() : '';
  }
  function colArr(row: string[], name: string): string[] {
    const v = col(row, name);
    return v
      ? v
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }
  function colInt(row: string[], name: string): number | null {
    const v = col(row, name);
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  const firmMap = new Map<string, unknown>();
  const investors: unknown[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Simple CSV split (no quoted-field support — use JSON for complex data)
    const row = line.split(',').map((v) => v.trim());

    const firmName = col(row, 'firm_name');
    if (!firmName) continue;

    if (!firmMap.has(firmName.toLowerCase())) {
      const firmType = col(row, 'firm_type') || null;
      firmMap.set(firmName.toLowerCase(), {
        name: firmName,
        firmType: firmType || null,
        hqCity: col(row, 'firm_hq_city') || null,
        hqCountry: col(row, 'firm_hq_country') || null,
        websiteUrl: col(row, 'firm_website') || null,
        linkedinUrl: col(row, 'firm_linkedin_url') || null,
        tracxnUrl: col(row, 'firm_tracxn_url') || null,
        foundedYear: colInt(row, 'firm_founded_year'),
      });
    }

    const firstName = col(row, 'investor_first_name');
    const lastName = col(row, 'investor_last_name');
    const title = col(row, 'investor_title');
    if (!firstName || !lastName || !title) continue;

    const rawDeals = col(row, 'recent_deals_json');
    let recentDeals: unknown = null;
    if (rawDeals) {
      try {
        recentDeals = JSON.parse(rawDeals);
      } catch {
        recentDeals = null;
      }
    }

    investors.push({
      firmName,
      firstName,
      lastName,
      title,
      decisionAuthority: col(row, 'investor_decision_authority') || 'partial',
      email: col(row, 'investor_email') || null,
      linkedinUrl: col(row, 'investor_linkedin_url') || null,
      city: col(row, 'investor_city') || null,
      country: col(row, 'investor_country') || null,
      tracxnUrl: col(row, 'investor_tracxn_url') || null,
      bioSummary: col(row, 'investor_bio_summary') || null,
      checkSizeMinUsd: colInt(row, 'investor_check_size_min_usd'),
      checkSizeMaxUsd: colInt(row, 'investor_check_size_max_usd'),
      sectorInterests: colArr(row, 'sector_interests'),
      stageInterests: colArr(row, 'stage_interests'),
      ...(recentDeals ? { pastInvestments: recentDeals } : {}),
    });
  }

  return { firms: [...firmMap.values()], investors };
}

async function main() {
  const { bulkImport, FirmDraftSchema, InvestorDraftSchema } =
    await import('@/lib/services/tracxn-import');
  const { db } = await import('@/lib/db/client');
  const { workspaces } = await import('@/lib/db/schema');

  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) {
    console.error('No workspace found. Run `pnpm db:seed` first or check DATABASE_URL.');
    process.exit(1);
  }
  console.log(`Using workspace: ${workspace.name} (${workspace.id})`);
  console.log(`Dry-run: ${isDryRun ? 'YES (pass --apply to commit)' : 'NO — writing to DB'}\n`);

  // Load input
  let rawFirms: unknown[] = [];
  let rawInvestors: unknown[] = [];

  if (filePath) {
    const content = readFileSync(resolve(filePath), 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      rawInvestors = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      rawFirms = Array.isArray(p['firms']) ? (p['firms'] as unknown[]) : [];
      rawInvestors = Array.isArray(p['investors']) ? (p['investors'] as unknown[]) : [];
    }
  } else if (csvPath) {
    const content = readFileSync(resolve(csvPath), 'utf-8');
    const result = parseCsv(content);
    rawFirms = result.firms;
    rawInvestors = result.investors;
  }

  // Validate
  const firms = rawFirms
    .map((f, i) => {
      const r = FirmDraftSchema.safeParse(f);
      if (!r.success) {
        console.warn(`⚠ firm[${i}] validation error — skipping:`, r.error.issues[0]);
        return null;
      }
      return r.data;
    })
    .filter(Boolean) as ReturnType<typeof FirmDraftSchema.parse>[];

  const investors = rawInvestors
    .map((inv, i) => {
      const r = InvestorDraftSchema.safeParse(inv);
      if (!r.success) {
        console.warn(`⚠ investor[${i}] validation error — skipping:`, r.error.issues[0]);
        return null;
      }
      return r.data;
    })
    .filter(Boolean) as ReturnType<typeof InvestorDraftSchema.parse>[];

  console.log(`Loaded: ${firms.length} firms, ${investors.length} investors`);

  // Batch investors, firms go in the first batch only
  let totalFirmsCreated = 0,
    totalFirmsUpdated = 0;
  let totalInvCreated = 0,
    totalInvUpdated = 0;
  let batchNum = 0;

  for (let offset = 0; offset < investors.length; offset += BATCH_SIZE) {
    batchNum++;
    const batch = investors.slice(offset, offset + BATCH_SIZE);
    const firmsForBatch = offset === 0 ? firms : [];

    console.log(
      `\nBatch ${batchNum}: ${batch.length} investors${firmsForBatch.length > 0 ? `, ${firmsForBatch.length} firms` : ''}`,
    );

    const result = await bulkImport(
      workspace.id,
      { firms: firmsForBatch, investors: batch },
      { dryRun: isDryRun },
    );

    totalFirmsCreated += result.firmsCreated;
    totalFirmsUpdated += result.firmsUpdated;
    totalInvCreated += result.investorsCreated;
    totalInvUpdated += result.investorsUpdated;

    const skipped = result.rows.filter((r) => r.status === 'skipped');
    if (skipped.length > 0) {
      skipped.forEach((r) => {
        if (r.kind === 'investor') console.warn(`  skipped investor ${r.email}: ${r.reason}`);
      });
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`Firms  created: ${totalFirmsCreated}   updated: ${totalFirmsUpdated}`);
  console.log(`Investors created: ${totalInvCreated}  updated: ${totalInvUpdated}`);
  if (isDryRun) {
    console.log('\n⚠  DRY RUN — nothing was written. Re-run without --dry-run to commit.');
  } else {
    console.log('\n✓  Import complete.');
  }
  console.log('═══════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPECTED JSON SHAPE (--file investors.json)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * {
 *   "firms": [
 *     {
 *       "name": "Accel Partners",                  // required
 *       "firmType": "vc",                           // vc|cvc|angel|family_office|accelerator|syndicate
 *       "hqCity": "Palo Alto",
 *       "hqCountry": "US",
 *       "websiteUrl": "https://accel.com",
 *       "linkedinUrl": "https://linkedin.com/company/accel",
 *       "tracxnUrl": "https://tracxn.com/a/investor/...",
 *       "foundedYear": 1983,
 *       "topSectorsInPortfolio": ["AI", "SaaS", "FoodTech"],
 *       "topEntryRounds": ["Seed", "Series A"],
 *       "dealsLast12Months": 8,
 *       "tracxnScore": 72,
 *       "recentDeals": [
 *         { "companyName": "Acme AI", "stage": "Seed", "amountUsd": 2000000, "date": "2024-03", "sector": "AI" }
 *       ],
 *       "keyPeople": [
 *         { "name": "Jane Smith", "title": "Partner", "linkedinUrl": "https://linkedin.com/in/janesmith" }
 *       ]
 *     }
 *   ],
 *   "investors": [
 *     {
 *       "firmName": "Accel Partners",              // required — must match a firm name above
 *       "firstName": "Jane",                       // required
 *       "lastName": "Smith",                       // required
 *       "title": "Partner",                        // required
 *       "decisionAuthority": "full",               // full|partial|influencer|none — required
 *       "email": "jane.smith@accel.com",           // needed for upsert; skip row if absent
 *       "linkedinUrl": "https://linkedin.com/in/janesmith",
 *       "city": "Palo Alto",
 *       "country": "US",
 *       "tracxnUrl": "https://tracxn.com/a/investor/...",
 *       "sectorInterests": ["AI", "SaaS", "Restaurant-Tech"],
 *       "stageInterests": ["Pre-Seed", "Seed"],
 *       "checkSizeMinUsd": 250000,
 *       "checkSizeMaxUsd": 2000000,
 *       "bioSummary": "Jane leads investments in AI-native B2B SaaS."
 *     }
 *   ]
 * }
 *
 * EXPECTED CSV SHAPE (--csv investors.csv)
 * ─────────────────────────────────────────────────────────────────────────────
 * Header row (comma-separated, order flexible):
 *   firm_name, firm_type, firm_hq_city, firm_hq_country, firm_website,
 *   firm_linkedin_url, firm_tracxn_url, firm_founded_year,
 *   investor_first_name, investor_last_name, investor_title,
 *   investor_decision_authority, investor_email, investor_linkedin_url,
 *   investor_city, investor_country, investor_tracxn_url,
 *   investor_bio_summary, investor_check_size_min_usd, investor_check_size_max_usd,
 *   sector_interests,   (pipe-separated: "AI|SaaS|Restaurant-Tech")
 *   stage_interests,    (pipe-separated: "Seed|Series A")
 *   recent_deals_json   (optional raw JSON string)
 */
