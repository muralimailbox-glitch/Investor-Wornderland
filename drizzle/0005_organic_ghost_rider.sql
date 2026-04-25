-- 0005: kb_ingest_log table for cross-run KB ingestion dedupe + bootstrap sentinel.
-- stored_files was created in 0004 — we use IF NOT EXISTS guards everywhere
-- to keep this migration safe on databases that already saw 0004.

CREATE TABLE IF NOT EXISTS "kb_ingest_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_sha256" text NOT NULL,
	"source" text NOT NULL,
	"section" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "kb_ingest_log" ADD CONSTRAINT "kb_ingest_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kb_ingest_log_content_idx" ON "kb_ingest_log" USING btree ("workspace_id","content_sha256");