/**
 * Run BEFORE `drizzle-kit migrate` on every container boot. Handles the
 * narrow class of DDL statements that Postgres forbids inside a transaction
 * (and which drizzle-kit always wraps migrations in). Today: ALTER TYPE
 * ... ADD VALUE on `email_outbox_status`. Add new entries here whenever a
 * future migration adds enum values.
 *
 * Each ADD VALUE statement runs via `postgres.unsafe()` in autocommit mode
 * (no implicit transaction). Idempotent — uses a `pg_enum` lookup to skip
 * values that already exist, so this is safe to run on every boot.
 *
 * If this script fails, the container start chain aborts before
 * drizzle-kit migrate so the DB is never left in a half-migrated state.
 *
 * Wired into railway.toml startCommand:
 *
 *   tsx scripts/pre-migrate.ts && drizzle-kit migrate && tsx scripts/bootstrap.ts && next start
 */
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.warn('[pre-migrate] DATABASE_URL unset — skipping (allowing container to continue)');
  process.exit(0);
}

/**
 * Enum additions that must commit BEFORE the next drizzle-kit migrate, so
 * subsequent migrations (and application code) can reference the new values.
 *
 * Each entry: [enum_type_name, [value1, value2, ...]]
 */
const ENUM_ADDITIONS: Array<[string, string[]]> = [
  ['email_outbox_status', ['draft', 'approved', 'cancelled']],
];

async function main() {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false });
  let added = 0;
  let skipped = 0;
  for (const [enumName, values] of ENUM_ADDITIONS) {
    for (const value of values) {
      // Idempotent guard: skip if value already exists. This works on every
      // PG version since 9.x; the IF NOT EXISTS clause on ADD VALUE itself
      // is only PG 12+ but our guard is universal.
      const exists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = ${enumName} AND e.enumlabel = ${value}
        ) AS exists
      `;
      if (exists[0]?.exists) {
        skipped++;
        continue;
      }
      // ADD VALUE must run outside any transaction. The postgres driver
      // executes a single .unsafe() statement in autocommit mode, which is
      // the safe path here.
      try {
        await sql.unsafe(
          `ALTER TYPE "public"."${enumName}" ADD VALUE '${value.replace(/'/g, "''")}'`,
        );
        added++;
        console.warn(`[pre-migrate] ${enumName}: added '${value}'`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Race condition fallback: another container added it between our
        // check and the ADD. Treat as success.
        if (/already exists/i.test(message)) {
          skipped++;
          continue;
        }
        console.error(`[pre-migrate] ${enumName}: failed to add '${value}': ${message}`);
        await sql.end({ timeout: 5 });
        process.exit(1);
      }
    }
  }
  console.warn(`[pre-migrate] done — ${added} added, ${skipped} already present`);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[pre-migrate] fatal:', err);
  process.exit(1);
});
