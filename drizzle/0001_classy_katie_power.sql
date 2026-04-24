CREATE TYPE "public"."watermark_policy" AS ENUM('per_investor', 'static', 'none');--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'cap_table' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'product_demo' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE 'term_sheet' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "watermark_policy" "watermark_policy" DEFAULT 'per_investor' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "founded_year" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "twitter_handle" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "tracxn_url" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "top_sectors_in_portfolio" text[];--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "top_locations_in_portfolio" text[];--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "top_entry_rounds" text[];--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "deals_last_12_months" integer;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "crunchbase_url" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "tracxn_url" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "angellist_url" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "check_size_min_usd" bigint;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "check_size_max_usd" bigint;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "sector_interests" text[];--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "stage_interests" text[];--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "past_investments" jsonb;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "bio_summary" text;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "warmth_score" integer;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "next_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_e164" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signature_markdown" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_website" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_timezone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;