/**
 * Read-only audit of investor field fill rates.
 *
 *   node_modules/.bin/tsx scripts/audit-investor-fields.ts
 *
 * Output: per-column non-null fill rate across all investors in the workspace,
 * sorted ascending so the lowest-utilised columns float to the top. Use the
 * report to decide which columns are dead weight in the schema.
 *
 * NO writes. Single SELECT against the investors table.
 */
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 2, prepare: false, ssl: 'prefer' });

const COLUMNS = [
  'first_name',
  'last_name',
  'title',
  'decision_authority',
  'email',
  'mobile_e164',
  'linkedin_url',
  'twitter_handle',
  'intro_path',
  'timezone',
  'preferred_meeting_hours',
  'prior_company',
  'mutual_connections',
  'personal_thesis_notes',
  'photo_url',
  'city',
  'country',
  'crunchbase_url',
  'tracxn_url',
  'angellist_url',
  'website_url',
  'check_size_min_usd',
  'check_size_max_usd',
  'sector_interests',
  'stage_interests',
  'past_investments',
  'bio_summary',
  'warmth_score',
  'last_contact_at',
  'next_reminder_at',
  'email_verified_at',
  'interests',
];

// Test rows from the e2e suite use @example.com emails or Asha Investor names.
// Filter them out so the audit reflects real investor data only.
const REAL_INVESTOR_FILTER = `
  email NOT LIKE '%@example.com'
  AND email NOT LIKE 'redacted+%@deleted.ootaos.local'
  AND NOT (first_name = 'Asha' AND last_name = 'Investor')
`;

async function main() {
  const grandTotalRow = await sql<
    { count: bigint }[]
  >`SELECT count(*)::bigint AS count FROM investors`;
  const grandTotal = Number(grandTotalRow[0]!.count);

  const totalRow = await sql.unsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM investors WHERE ${REAL_INVESTOR_FILTER}`,
  );
  const total = Number(totalRow[0]!.count);
  console.log(`Investors in DB: ${grandTotal}`);
  console.log(`After excluding e2e test rows: ${total}`);
  if (total === 0) {
    console.log('No real investors after filter. Nothing to audit.');
    await sql.end({ timeout: 5 });
    return;
  }

  const results: Array<{
    column: string;
    filled: number;
    pct: number;
    example?: string | undefined;
  }> = [];

  for (const col of COLUMNS) {
    // Treat empty strings, empty arrays, and SQL NULL as "not filled".
    let filledRow;
    if (col === 'mutual_connections' || col === 'sector_interests' || col === 'stage_interests') {
      filledRow = await sql.unsafe(
        `SELECT count(*)::bigint AS count FROM investors WHERE ${REAL_INVESTOR_FILTER} AND "${col}" IS NOT NULL AND array_length("${col}", 1) > 0`,
      );
    } else if (col === 'past_investments' || col === 'interests') {
      filledRow = await sql.unsafe(
        `SELECT count(*)::bigint AS count FROM investors WHERE ${REAL_INVESTOR_FILTER} AND "${col}" IS NOT NULL AND "${col}"::text NOT IN ('null', '[]', '{}')`,
      );
    } else if (
      col === 'check_size_min_usd' ||
      col === 'check_size_max_usd' ||
      col === 'warmth_score' ||
      col === 'last_contact_at' ||
      col === 'next_reminder_at' ||
      col === 'email_verified_at'
    ) {
      filledRow = await sql.unsafe(
        `SELECT count(*)::bigint AS count FROM investors WHERE ${REAL_INVESTOR_FILTER} AND "${col}" IS NOT NULL`,
      );
    } else {
      filledRow = await sql.unsafe(
        `SELECT count(*)::bigint AS count FROM investors WHERE ${REAL_INVESTOR_FILTER} AND "${col}" IS NOT NULL AND length(trim("${col}"::text)) > 0`,
      );
    }
    const filled = Number((filledRow[0] as unknown as { count: bigint }).count);

    let example: string | undefined;
    if (filled > 0) {
      const exRow = await sql.unsafe(
        `SELECT "${col}"::text AS sample FROM investors WHERE ${REAL_INVESTOR_FILTER} AND "${col}" IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
      );
      const sample = (exRow[0] as { sample: string } | undefined)?.sample ?? '';
      example = sample.length > 60 ? sample.slice(0, 57) + '...' : sample;
    }

    results.push({ column: col, filled, pct: (filled / total) * 100, example });
  }

  results.sort((a, b) => a.pct - b.pct);

  console.log('\nField fill report (ascending — drop candidates first):\n');
  console.log('  Column                       Filled / Total  %       Example');
  console.log('  ' + '─'.repeat(94));
  for (const r of results) {
    const col = r.column.padEnd(28);
    const ratio = `${String(r.filled).padStart(4)} / ${String(total).padEnd(4)}`;
    const pct = `${r.pct.toFixed(1).padStart(5)}%`;
    const ex = r.example ? `"${r.example}"` : '-';
    console.log(`  ${col} ${ratio}  ${pct}   ${ex}`);
  }

  console.log('\nDrop candidates (< 10% fill):');
  const drops = results.filter((r) => r.pct < 10);
  for (const r of drops) console.log(`  - ${r.column} (${r.pct.toFixed(1)}%)`);
  if (drops.length === 0) console.log('  none');

  console.log('\nKeep solidly (>= 50% fill):');
  for (const r of results.filter((r) => r.pct >= 50)) {
    console.log(`  - ${r.column} (${r.pct.toFixed(1)}%)`);
  }

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error('AUDIT FAILED:', err);
  process.exit(2);
});
