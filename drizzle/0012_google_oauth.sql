-- 0012: Google OAuth token store for Calendar integration.
--
-- One row per (workspace, user, scope-set). The bookMeeting() service consults
-- this table; if a non-expired token exists, it creates a real Calendar event
-- via the Google API. If not, it falls back to the synthetic meet.google.com
-- link generator we ship today.

CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "scope" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "calendar_id" text NOT NULL DEFAULT 'primary',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_oauth_tokens_user_idx" UNIQUE ("workspace_id", "user_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "google_oauth_tokens_lookup_idx"
  ON "google_oauth_tokens" ("workspace_id", "user_id");
