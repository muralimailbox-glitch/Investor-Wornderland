-- 0006: kb_ingest_log redesigned for file-update tracking.
-- One row per (workspace, source) so a re-ingest can compare
-- contentSha256 and replace stale chunks atomically.

DROP INDEX IF EXISTS "kb_ingest_log_content_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kb_ingest_log_source_idx" ON "kb_ingest_log" USING btree ("workspace_id","source");
