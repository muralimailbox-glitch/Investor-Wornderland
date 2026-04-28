/**
 * Removes e2e test pollution from the investors table.
 *
 *   node_modules/.bin/tsx scripts/cleanup-e2e-pollution.ts            # dry-run
 *   node_modules/.bin/tsx scripts/cleanup-e2e-pollution.ts --apply    # actually delete
 *
 * Identifies test rows by the patterns the e2e fixtures emit:
 *   - email LIKE '%@example.com'                  (makeEmail() default domain)
 *   - email LIKE 'redacted+%@deleted.ootaos.local' (anonymised stragglers)
 *
 * Lets cascades take care of leads/interactions/email_outbox via the FK
 * constraints on those tables. Reports counts before and after so the
 * operator can sanity-check.
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

const apply = process.argv.includes('--apply');
const sql = postgres(databaseUrl, { max: 2, prepare: false, ssl: 'prefer' });

const TEST_FILTER = `(
  email LIKE '%@example.com'
  OR email LIKE 'redacted+%@deleted.ootaos.local'
)`;

async function main() {
  // Counts before
  const [allBefore] = await sql<
    { count: bigint }[]
  >`SELECT count(*)::bigint AS count FROM investors`;
  const [testBefore] = await sql.unsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM investors WHERE ${TEST_FILTER}`,
  );
  const [leadsBefore] = await sql.unsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM leads l
     WHERE EXISTS (SELECT 1 FROM investors i WHERE i.id = l.investor_id AND ${TEST_FILTER.replace(/email/g, 'i.email')})`,
  );
  const [interactionsBefore] = await sql.unsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM interactions x
     WHERE EXISTS (SELECT 1 FROM investors i WHERE i.id = x.investor_id AND ${TEST_FILTER.replace(/email/g, 'i.email')})`,
  );

  console.log('Investors total:                ', Number(allBefore!.count));
  console.log('Investors matching test filter: ', Number(testBefore!.count));
  console.log('Leads owned by test investors:  ', Number(leadsBefore!.count));
  console.log('Interactions on test investors: ', Number(interactionsBefore!.count));
  console.log('');

  if (Number(testBefore!.count) === 0) {
    console.log('Nothing to clean up.');
    await sql.end({ timeout: 5 });
    return;
  }

  if (!apply) {
    console.log('Dry run. Re-run with --apply to actually delete.');
    await sql.end({ timeout: 5 });
    return;
  }

  console.log('Applying delete (cascades will fire)...');
  const startedAt = Date.now();
  await sql.unsafe(`DELETE FROM investors WHERE ${TEST_FILTER}`);
  const ms = Date.now() - startedAt;

  // Counts after — should be 0 for all three
  const [allAfter] = await sql<
    { count: bigint }[]
  >`SELECT count(*)::bigint AS count FROM investors`;
  const [testAfter] = await sql.unsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count FROM investors WHERE ${TEST_FILTER}`,
  );

  console.log(`Deleted in ${ms}ms.`);
  console.log('Investors after:                ', Number(allAfter!.count));
  console.log('Test rows remaining (should be 0):', Number(testAfter!.count));

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error('CLEANUP FAILED:', err);
  process.exit(2);
});
