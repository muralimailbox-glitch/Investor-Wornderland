import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ISSUANCES_PER_WINDOW = 3;
const MAX_FAILED_ATTEMPTS = 5;

export class OtpThrottleError extends Error {
  constructor(public reason: 'too_many_otps' | 'too_many_attempts' | 'locked') {
    super(reason);
    this.name = 'OtpThrottleError';
  }
}

function hashOtp(code: string, email: string): string {
  return createHmac('sha256', env.AUTH_SECRET)
    .update(`${email.toLowerCase()}|${code}`)
    .digest('hex');
}

/**
 * Bumps issuance counter; rejects when over the per-window cap or while a
 * lockout is active. Resets the window when the previous one expired.
 */
async function reserveIssuance(email: string): Promise<void> {
  const result = await db.execute<{
    issuance_count: number;
    locked_until: Date | string | null;
  }>(sql`
    INSERT INTO otp_throttle (email, issuance_count, window_started_at)
    VALUES (${email}, 1, now())
    ON CONFLICT (email) DO UPDATE
      SET
        issuance_count = CASE
          WHEN otp_throttle.window_started_at < now() - INTERVAL '1 hour' THEN 1
          ELSE otp_throttle.issuance_count + 1
        END,
        failed_attempt_count = CASE
          WHEN otp_throttle.window_started_at < now() - INTERVAL '1 hour' THEN 0
          ELSE otp_throttle.failed_attempt_count
        END,
        window_started_at = CASE
          WHEN otp_throttle.window_started_at < now() - INTERVAL '1 hour' THEN now()
          ELSE otp_throttle.window_started_at
        END,
        locked_until = CASE
          WHEN otp_throttle.locked_until IS NOT NULL AND otp_throttle.locked_until < now()
            THEN NULL
          ELSE otp_throttle.locked_until
        END
    RETURNING issuance_count, locked_until
  `);
  const row = result[0];
  if (!row) throw new Error('otp_throttle insert returned no row');
  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new OtpThrottleError('locked');
  }
  if (row.issuance_count > MAX_ISSUANCES_PER_WINDOW) {
    throw new OtpThrottleError('too_many_otps');
  }
}

/**
 * Records a verification outcome. After MAX_FAILED_ATTEMPTS consecutive
 * failures, sets locked_until = now + 1h. On success resets the failed
 * counter so a clean signin clears the slate.
 */
async function recordVerificationOutcome(email: string, ok: boolean): Promise<void> {
  if (ok) {
    await db.execute(sql`
      UPDATE otp_throttle SET failed_attempt_count = 0 WHERE email = ${email}
    `);
    return;
  }
  await db.execute(sql`
    INSERT INTO otp_throttle (email, failed_attempt_count, window_started_at)
    VALUES (${email}, 1, now())
    ON CONFLICT (email) DO UPDATE
      SET failed_attempt_count = otp_throttle.failed_attempt_count + 1,
          locked_until = CASE
            WHEN otp_throttle.failed_attempt_count + 1 >= ${MAX_FAILED_ATTEMPTS}
              THEN now() + INTERVAL '1 hour'
            ELSE otp_throttle.locked_until
          END
  `);
}

async function isLocked(email: string): Promise<boolean> {
  const rows = await db.execute<{ locked_until: Date | string | null }>(sql`
    SELECT locked_until FROM otp_throttle WHERE email = ${email}
  `);
  const row = rows[0];
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

/**
 * Generates a 6-digit OTP, persists the HMAC-hashed form in the rate_limits
 * table under a namespaced composite key `nda-otp:<email>|<hash>`, and
 * returns the plaintext OTP to the caller for SMTP delivery.
 *
 * Throws OtpThrottleError when the email is locked or has exceeded the
 * issuance cap (3 per hour) — the caller maps to a 429 response.
 *
 * The key pattern keeps OTP storage physically separated from real rate-limit
 * keys (which always carry an IP segment) and avoids adding a dedicated
 * table just for the 10-minute lifecycle of a verification code.
 */
export async function issueOtp(email: string): Promise<string> {
  const normalized = email.toLowerCase();
  await reserveIssuance(normalized);
  const code = randomInt(100000, 1000000).toString();
  const hashed = hashOtp(code, normalized);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  // Purge any outstanding OTPs for this email first — most recent wins.
  await db.execute(sql`DELETE FROM rate_limits WHERE key LIKE ${`nda-otp:${normalized}|%`}`);
  // `tokens` column is int32 and historically meant for rate-limit counts; we
  // co-tenant the table for OTPs by setting tokens=1 as a marker and storing
  // the expiry in `refilled_at` (timestamptz) which has no range issues.
  await db.execute(sql`
    INSERT INTO rate_limits (key, tokens, refilled_at)
    VALUES (${`nda-otp:${normalized}|${hashed}`}, 1, ${expiresAt.toISOString()})
  `);
  return code;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  if (await isLocked(normalized)) {
    throw new OtpThrottleError('locked');
  }
  const hashed = hashOtp(code, normalized);
  const rows = await db.execute<{ key: string; refilled_at: Date | string }>(sql`
    SELECT key, refilled_at FROM rate_limits
    WHERE key = ${`nda-otp:${normalized}|${hashed}`}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) {
    await recordVerificationOutcome(normalized, false);
    return false;
  }
  const expiresAtMs = new Date(row.refilled_at).getTime();
  if (expiresAtMs < Date.now()) {
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${row.key}`);
    await recordVerificationOutcome(normalized, false);
    return false;
  }
  const expected = Buffer.from(hashed, 'hex');
  const actualKeyHash = row.key.slice(`nda-otp:${normalized}|`.length);
  const actual = Buffer.from(actualKeyHash, 'hex');
  if (expected.length !== actual.length) {
    await recordVerificationOutcome(normalized, false);
    return false;
  }
  const ok = timingSafeEqual(expected, actual);
  if (ok) {
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${row.key}`);
  }
  await recordVerificationOutcome(normalized, ok);
  return ok;
}

export function fingerprintOtp(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}
