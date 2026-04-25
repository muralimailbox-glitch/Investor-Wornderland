/**
 * Backfill the new lead-state columns from the legacy investor copies.
 *
 *   investors.warmth_score      → leads.warmth_score      (per active lead)
 *   investors.intro_path        → leads.intro_path        (per active lead)
 *   investors.last_contact_at   → leads.last_contact_at   (max of investor's leads)
 *   investors.next_reminder_at  → leads.next_action_due   (per active lead, only if null)
 *   documents.deal_id           → first deal in workspace (where null)
 *   documents.min_lead_stage    → 'nda_signed' for sensitive kinds where null
 *
 * Idempotent: only writes where the new column is currently NULL. Safe to
 * re-run after every refactor pass. Run via:
 *
 *   railway run pnpm tsx scripts/backfill-leads-from-investors.ts
 *
 * After this completes, the Phase 4 destructive migration
 * (drizzle/manual/drop-legacy-investor-cols.sql) is safe to apply.
 */
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/lib/db/schema';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[backfill] DATABASE_URL unset — run via `railway run`');
  process.exit(1);
}

const pgClient = postgres(databaseUrl, { max: 2, prepare: false });
const db = drizzle(pgClient, { schema });

async function main() {
  console.warn('[backfill] starting…');

  const r1 = await db.execute(sql`
    UPDATE leads l SET warmth_score = i.warmth_score
    FROM investors i
    WHERE l.investor_id = i.id
      AND l.warmth_score IS NULL
      AND i.warmth_score IS NOT NULL
      AND l.stage NOT IN ('funded','closed_lost')
  `);
  console.warn(
    `[backfill]   leads.warmth_score    ← investors.warmth_score    (${r1.count ?? 0} rows)`,
  );

  const r2 = await db.execute(sql`
    UPDATE leads l SET intro_path = i.intro_path
    FROM investors i
    WHERE l.investor_id = i.id
      AND l.intro_path IS NULL
      AND i.intro_path IS NOT NULL
  `);
  console.warn(
    `[backfill]   leads.intro_path      ← investors.intro_path      (${r2.count ?? 0} rows)`,
  );

  const r3 = await db.execute(sql`
    UPDATE leads l SET last_contact_at = COALESCE(
      (SELECT max(created_at) FROM interactions
        WHERE lead_id = l.id
          AND kind IN ('email_sent','email_received','meeting_held','question_asked')),
      i.last_contact_at
    )
    FROM investors i
    WHERE l.investor_id = i.id
      AND l.last_contact_at IS NULL
  `);
  console.warn(
    `[backfill]   leads.last_contact_at ← investors+interactions    (${r3.count ?? 0} rows)`,
  );

  const r4 = await db.execute(sql`
    UPDATE leads l SET next_action_due = i.next_reminder_at
    FROM investors i
    WHERE l.investor_id = i.id
      AND l.next_action_due IS NULL
      AND i.next_reminder_at IS NOT NULL
  `);
  console.warn(
    `[backfill]   leads.next_action_due ← investors.next_reminder_at(${r4.count ?? 0} rows)`,
  );

  const r5 = await db.execute(sql`
    UPDATE documents d SET deal_id = (
      SELECT id FROM deals
        WHERE workspace_id = d.workspace_id
        ORDER BY created_at DESC LIMIT 1
    )
    WHERE d.deal_id IS NULL AND d.deleted_at IS NULL
  `);
  console.warn(
    `[backfill]   documents.deal_id      ← latest workspace deal     (${r5.count ?? 0} rows)`,
  );

  const r6 = await db.execute(sql`
    UPDATE documents SET min_lead_stage = 'nda_signed'
    WHERE kind IN ('financial_model','cap_table','term_sheet','customer_refs')
      AND min_lead_stage IS NULL
      AND deleted_at IS NULL
  `);
  console.warn(
    `[backfill]   documents.min_lead_stage = 'nda_signed' for sensitive kinds (${r6.count ?? 0} rows)`,
  );

  // Sanity check: how many active investors lack an active lead?
  const orphans = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM investors i
    WHERE NOT EXISTS (
      SELECT 1 FROM leads l
       WHERE l.investor_id = i.id
         AND l.stage NOT IN ('funded','closed_lost')
    )
  `);
  const n = (orphans[0]?.n ?? 0) as number;
  console.warn(
    `[backfill]   investors without an active lead: ${n}${n > 0 ? '  ← create leads before drop-legacy migration' : ''}`,
  );

  console.warn('[backfill] done');
}

main()
  .then(async () => {
    await pgClient.end({ timeout: 5 });
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[backfill] failed:', err);
    await pgClient.end({ timeout: 5 });
    process.exit(1);
  });
