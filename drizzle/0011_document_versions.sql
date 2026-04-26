-- 0011: document version history.
--
-- Replacing a deck used to overwrite — losing the previous file. Now every
-- replace archives the prior version. Investors always see the current row
-- in `documents`; the history is admin-only via /cockpit/documents.

CREATE TABLE IF NOT EXISTS "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "kind" "document_kind" NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "r2_key" text NOT NULL,
  "sha256" text NOT NULL,
  "min_lead_stage" "lead_stage",
  "deal_id" uuid,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archived_by" uuid,
  CONSTRAINT "document_versions_doc_version_idx" UNIQUE ("document_id", "version")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_versions_workspace_doc_idx"
  ON "document_versions" ("workspace_id", "document_id", "version");
