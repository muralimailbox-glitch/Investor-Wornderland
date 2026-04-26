-- 0010: revocation list for HMAC-signed investor magic links.
--
-- The token itself is stateless (HMAC-signed JWT), so we can't change its
-- contents to flip a "revoked" bit. Instead we record the issuedAt of every
-- token we want to invalidate; verifyInvestorLink consults this list and
-- rejects any token issued before the matching investor's revoke cutoff.
--
-- Revoking by investorId scales badly with millions of signed tokens, but
-- this app issues hundreds total — perfectly fine.

CREATE TABLE IF NOT EXISTS "investor_link_revocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "investor_id" uuid NOT NULL,
  "revoked_before" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_by" uuid,
  "reason" text,
  CONSTRAINT "investor_link_revocations_investor_idx" UNIQUE ("workspace_id", "investor_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "investor_link_revocations_lookup_idx"
  ON "investor_link_revocations" ("workspace_id", "investor_id");
