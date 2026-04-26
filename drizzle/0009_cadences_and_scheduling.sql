-- 0009: drip cadences + scheduled sends.
--
-- A cadence is just a group_id stamped on multiple email_outbox rows, each
-- with a `scheduled_for` timestamp. The cron pump (/api/v1/cron/cadences)
-- ships any 'approved' row whose scheduled_for has arrived. On inbound reply,
-- /lib/services/inbox-sync flips remaining rows in the cadence to
-- status='cancelled' so the investor doesn't get more drips after they
-- already responded.

ALTER TABLE "email_outbox"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "email_outbox"
  ADD COLUMN IF NOT EXISTS "cadence_group_id" uuid;
--> statement-breakpoint

ALTER TABLE "email_outbox"
  ADD COLUMN IF NOT EXISTS "step_index" integer;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_outbox_scheduled_idx"
  ON "email_outbox" ("scheduled_for")
  WHERE status IN ('approved', 'queued');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_outbox_cadence_idx"
  ON "email_outbox" ("cadence_group_id")
  WHERE cadence_group_id IS NOT NULL;
--> statement-breakpoint

-- Add 'cancelled' to email_outbox_status. Has to run separately because
-- ALTER TYPE ADD VALUE can't run inside a transaction with other DDL.
-- The pre-migrate.ts script handles this in its own autocommit step.
