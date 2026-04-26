-- 0014: per-email OTP throttle (FR-021).
--
-- Two limits per rolling 1-hour window:
--   - max 3 OTP issuances per email
--   - max 5 verification failures per email (then 1-hour lockout)
--
-- Tracks a single row per email so noisy clients can't spam different OTP
-- values. Window resets when window_started_at is older than 1h.

CREATE TABLE IF NOT EXISTS "otp_throttle" (
  "email" text PRIMARY KEY,
  "issuance_count" integer NOT NULL DEFAULT 0,
  "failed_attempt_count" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "locked_until" timestamp with time zone
);
