-- 0015: drop investor columns with 0% real-data fill + add fit_rationale.
--
-- Audit (2026-04-28) showed 10 columns with zero non-test data across the
-- 67 real investors. They have no enrichment source either — manual-only
-- text fields nobody fills. Drop them; reclaim the space and keep the
-- edit modal honest.
--
-- Splits bio_summary (partner background) and fit_rationale (one-line
-- reason this investor fits OotaOS). Previously a single column conflated
-- both, so every Tracxn refresh wiped the OotaOS context.
--
-- IF EXISTS / IF NOT EXISTS guards make this idempotent — pre-migrate
-- runs orphan migrations on every boot, so this needs to be safe to run
-- against a partially-applied schema.

ALTER TABLE "investors" DROP COLUMN IF EXISTS "twitter_handle";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "crunchbase_url";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "angellist_url";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "photo_url";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "interests";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "mobile_e164";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "preferred_meeting_hours";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "mutual_connections";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "personal_thesis_notes";
--> statement-breakpoint
ALTER TABLE "investors" DROP COLUMN IF EXISTS "prior_company";
--> statement-breakpoint

ALTER TABLE "investors" ADD COLUMN IF NOT EXISTS "fit_rationale" text;
--> statement-breakpoint

COMMENT ON COLUMN "investors"."warmth_score" IS
  'Derived score 0-100 from recency + sector density + stage match. Computed during enrichment, not a Tracxn-native field.';
--> statement-breakpoint

COMMENT ON COLUMN "investors"."bio_summary" IS
  'Partner background bio (LinkedIn-fillable). Distinct from fit_rationale which carries OotaOS-specific fit context.';
--> statement-breakpoint

COMMENT ON COLUMN "investors"."fit_rationale" IS
  'One-sentence reason this investor fits OotaOS. Refreshed during Tracxn enrichment.';
