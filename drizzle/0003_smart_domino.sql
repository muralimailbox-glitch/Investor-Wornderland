ALTER TABLE "firms" ADD COLUMN "tracxn_score" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "median_portfolio_tracxn_score" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "portfolio_ipos" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "portfolio_acquisitions" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "portfolio_unicorns" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "portfolio_soonicorns" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "team_size_total" integer;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "fund_classification" text[];--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "operating_location" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "stage_distribution" jsonb;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "sector_distribution" jsonb;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "location_distribution" jsonb;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "special_flags" text[];--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "recent_deals" jsonb;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "key_people" jsonb;