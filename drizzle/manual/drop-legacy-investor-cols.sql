-- Manual migration: drop legacy investor columns + add invariants.
-- Run this AFTER:
--   1. backups/<ISO>.dump exists and round-trips (pg_restore --list)
--   2. scripts/restore-essentials.ts has populated leads.warmthScore /
--      introPath / lastContactAt and documents.dealId
--   3. cockpit + public routes verified working against the new columns
--
-- Trigger:
--   pnpm refactor:drop-legacy           (local; uses DATABASE_URL)
--   railway run pnpm refactor:drop-legacy   (production)

BEGIN;

-- Investors: drop the contact-shaped + fund-shaped + relationship-state
-- duplicates that moved to firms or leads.
ALTER TABLE investors
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS twitter_handle,
  DROP COLUMN IF EXISTS crunchbase_url,
  DROP COLUMN IF EXISTS angellist_url,
  DROP COLUMN IF EXISTS website_url,
  DROP COLUMN IF EXISTS past_investments,
  DROP COLUMN IF EXISTS bio_summary,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS prior_company,
  DROP COLUMN IF EXISTS mutual_connections,
  DROP COLUMN IF EXISTS personal_thesis_notes,
  DROP COLUMN IF EXISTS interests,
  DROP COLUMN IF EXISTS warmth_score,
  DROP COLUMN IF EXISTS intro_path,
  DROP COLUMN IF EXISTS last_contact_at,
  DROP COLUMN IF EXISTS next_reminder_at,
  DROP COLUMN IF EXISTS check_size_min_usd,
  DROP COLUMN IF EXISTS check_size_max_usd,
  DROP COLUMN IF EXISTS sector_interests,
  DROP COLUMN IF EXISTS stage_interests;

-- Rename preferred_meeting_hours → preferred_channel (semantic rename).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='investors' AND column_name='preferred_meeting_hours') THEN
    ALTER TABLE investors RENAME COLUMN preferred_meeting_hours TO preferred_channel;
  END IF;
END $$;

-- Lead invariants: every active investor has exactly one active lead per (investor, deal).
CREATE UNIQUE INDEX IF NOT EXISTS leads_one_active_per_investor
  ON leads (workspace_id, investor_id, deal_id)
  WHERE stage NOT IN ('funded','closed_lost');

-- Pipeline rule constraints (rules 5, 6, 7).
DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_post_contacted_action
    CHECK (stage IN ('prospect','contacted','funded','closed_lost')
           OR (next_action_owner IS NOT NULL AND next_action_due IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_closed_lost_reason
    CHECK (stage <> 'closed_lost' OR closed_lost_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE leads ADD CONSTRAINT leads_funded_fields
    CHECK (stage <> 'funded' OR (funded_amount_usd IS NOT NULL AND funded_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
