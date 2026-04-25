-- 0008: fundraising-OS Phase 1 — additive schema changes.
--
-- Runs in its own transaction AFTER 0007 commits the new enum values, so
-- ALTER COLUMN ... SET DEFAULT 'draft' is now safe (Postgres restriction).
-- All statements use IF NOT EXISTS / DO blocks so re-running on a partial
-- state is harmless.

-- Default flip — new rows go to 'draft' (rule #11). Existing rows untouched.
ALTER TABLE "email_outbox" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint

-- New invite_links table (deal-scoping for public routes — rules #8, #9).
CREATE TABLE IF NOT EXISTS "invite_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"lead_id" uuid,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Additive columns
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "close_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "min_lead_stage" "lead_stage";--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "warmth_score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "intro_path" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "closed_lost_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "funded_amount_usd" bigint;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "funded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "committed_usd" bigint;--> statement-breakpoint

-- FK constraints (DO blocks so re-running is safe)
DO $$ BEGIN
  ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "documents" ADD CONSTRAINT "documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "invite_links_token_idx" ON "invite_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_links_investor_idx" ON "invite_links" USING btree ("workspace_id","investor_id");
