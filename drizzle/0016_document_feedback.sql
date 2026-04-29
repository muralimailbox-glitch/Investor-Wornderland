-- 0016: document feedback (investor → founder)
--
-- Two flavours stored together so the founder cockpit gets one inbox:
--   • kind=feedback     — comments tied to a specific document (rating optional)
--   • kind=request_new  — investor asking for a document we don't have yet
--
-- The pre-migrate.ts repair block also creates these objects (idempotent
-- guards on every statement) so production stays in sync even when the
-- drizzle journal hasn't tracked a migration. This file is the canonical
-- record matching the schema.ts definition.

DO $$ BEGIN
  CREATE TYPE "public"."document_feedback_kind" AS ENUM ('feedback', 'request_new');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "lead_id" uuid,
  "document_id" uuid,
  "kind" "document_feedback_kind" NOT NULL,
  "rating" integer,
  "message" text NOT NULL,
  "requested_title" text,
  "submitted_by_email" varchar(254) NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "acknowledged_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_feedback_workspace_idx"
  ON "document_feedback" ("workspace_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_feedback_document_idx"
  ON "document_feedback" ("document_id");
