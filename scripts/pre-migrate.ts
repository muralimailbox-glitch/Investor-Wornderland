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
  // ── Orphan-migration repair ─────────────────────────────────────────
  // Migrations 0009 through 0014 exist as SQL files on disk but were never
  // committed to drizzle/meta/_journal.json (and have no snapshot files).
  // drizzle-kit migrate iterates the journal, so it has no awareness of
  // these — meaning prod has been running on the 0008 schema while the
  // application code expects 0014. The smoking gun: insert into
  // email_outbox 500s with `column "scheduled_for" of relation
  // "email_outbox" does not exist` because 0009 never applied.
  //
  // Every statement below mirrors the orphan SQL files and uses
  // IF NOT EXISTS, so this block is safe to run on every container boot.
  // Once these execute successfully on prod, the schema matches the code
  // even though the drizzle journal still doesn't list 0009-0014.
  const REPAIR_STATEMENTS: Array<{ tag: string; sql: string }> = [
    // 0009 — email_outbox cadence/scheduling columns
    {
      tag: '0009.scheduled_for',
      sql: `ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone`,
    },
    {
      tag: '0009.cadence_group_id',
      sql: `ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "cadence_group_id" uuid`,
    },
    {
      tag: '0009.step_index',
      sql: `ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "step_index" integer`,
    },
    {
      tag: '0009.scheduled_idx',
      sql: `CREATE INDEX IF NOT EXISTS "email_outbox_scheduled_idx" ON "email_outbox" ("scheduled_for") WHERE status IN ('approved', 'queued')`,
    },
    {
      tag: '0009.cadence_idx',
      sql: `CREATE INDEX IF NOT EXISTS "email_outbox_cadence_idx" ON "email_outbox" ("cadence_group_id") WHERE cadence_group_id IS NOT NULL`,
    },
    // 0010 — investor link revocations
    {
      tag: '0010.revocations',
      sql: `CREATE TABLE IF NOT EXISTS "investor_link_revocations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" uuid NOT NULL,
        "investor_id" uuid NOT NULL,
        "revoked_before" timestamp with time zone NOT NULL,
        "revoked_at" timestamp with time zone NOT NULL DEFAULT now(),
        "revoked_by" uuid,
        "reason" text,
        CONSTRAINT "investor_link_revocations_investor_idx" UNIQUE ("workspace_id", "investor_id")
      )`,
    },
    {
      tag: '0010.revocations_lookup_idx',
      sql: `CREATE INDEX IF NOT EXISTS "investor_link_revocations_lookup_idx" ON "investor_link_revocations" ("workspace_id", "investor_id")`,
    },
    // 0011 — document version history
    {
      tag: '0011.document_versions',
      sql: `CREATE TABLE IF NOT EXISTS "document_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" uuid NOT NULL,
        "document_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "kind" "document_kind" NOT NULL,
        "original_filename" text NOT NULL,
        "mime_type" text NOT NULL,
        "size_bytes" integer NOT NULL,
        "r2_key" text NOT NULL,
        "sha256" text NOT NULL,
        "min_lead_stage" "lead_stage",
        "deal_id" uuid,
        "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
        "archived_by" uuid,
        CONSTRAINT "document_versions_doc_version_idx" UNIQUE ("document_id", "version")
      )`,
    },
    {
      tag: '0011.document_versions_idx',
      sql: `CREATE INDEX IF NOT EXISTS "document_versions_workspace_doc_idx" ON "document_versions" ("workspace_id", "document_id", "version")`,
    },
    // 0012 — google oauth tokens
    {
      tag: '0012.google_oauth_tokens',
      sql: `CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "workspace_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "access_token" text NOT NULL,
        "refresh_token" text,
        "scope" text NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "calendar_id" text NOT NULL DEFAULT 'primary',
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT "google_oauth_tokens_user_idx" UNIQUE ("workspace_id", "user_id")
      )`,
    },
    {
      tag: '0012.google_oauth_tokens_idx',
      sql: `CREATE INDEX IF NOT EXISTS "google_oauth_tokens_lookup_idx" ON "google_oauth_tokens" ("workspace_id", "user_id")`,
    },
    // 0013 — backfill documents.deal_id (idempotent: only touches null rows)
    {
      tag: '0013.backfill_doc_deal',
      sql: `UPDATE documents AS d
            SET deal_id = (
              SELECT id FROM deals
              WHERE workspace_id = d.workspace_id
              ORDER BY created_at DESC
              LIMIT 1
            )
            WHERE d.deal_id IS NULL
              AND EXISTS (SELECT 1 FROM deals WHERE workspace_id = d.workspace_id)`,
    },
    // 0014 — otp throttle
    {
      tag: '0014.otp_throttle',
      sql: `CREATE TABLE IF NOT EXISTS "otp_throttle" (
        "email" text PRIMARY KEY,
        "issuance_count" integer NOT NULL DEFAULT 0,
        "failed_attempt_count" integer NOT NULL DEFAULT 0,
        "window_started_at" timestamp with time zone NOT NULL DEFAULT now(),
        "locked_until" timestamp with time zone
      )`,
    },
  ];

  let repairOk = 0;
  let repairFail = 0;
  for (const stmt of REPAIR_STATEMENTS) {
    try {
      await sql.unsafe(stmt.sql);
      repairOk++;
    } catch (err) {
      repairFail++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pre-migrate] repair ${stmt.tag} failed: ${message}`);
    }
  }
  console.warn(`[pre-migrate] schema repair — ${repairOk} ok, ${repairFail} failed`);

  console.warn(`[pre-migrate] done — ${added} enums added, ${skipped} already present`);
  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[pre-migrate] fatal:', err);
  process.exit(1);
});
