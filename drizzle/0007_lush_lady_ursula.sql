-- 0007: NO-OP (intentionally empty).
--
-- Postgres restricts ALTER TYPE … ADD VALUE inside a transaction, and
-- drizzle-kit wraps every migration in a transaction. This file used to
-- contain the enum additions for email_outbox_status; they now run via
-- scripts/pre-migrate.ts (autocommit, before drizzle-kit migrate) so
-- migration 0008 can safely use the new values as a column default.
--
-- Kept as a journaled but empty migration so prod environments that
-- already recorded this entry (or partially executed it) stay in sync.

SELECT 1;
