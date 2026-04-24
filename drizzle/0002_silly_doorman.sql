ALTER TYPE "public"."interaction_kind" ADD VALUE 'email_verified';--> statement-breakpoint
ALTER TABLE "interactions" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "investor_id" uuid;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investors" ADD COLUMN "interests" jsonb;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."investors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interactions_investor_timeline_idx" ON "interactions" USING btree ("investor_id","created_at");