import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { env } from '@/lib/env';

const OTP_TTL_MS = 10 * 60 * 1000;

function hashOtp(code: string, email: string): string {
  return createHmac('sha256', env.AUTH_SECRET)
    .update(`${email.toLowerCase()}|${code}`)
    .digest('hex');
}

/**
 * Generates a 6-digit OTP, persists the HMAC-hashed form in the rate_limits
 * table under a namespaced composite key `nda-otp:<email>|<hash>`, and
 * returns the plaintext OTP to the caller for SMTP delivery.
 *
 * The key pattern keeps OTP storage physically separated from real rate-limit
 * keys (which always carry an IP segment) and avoids adding a dedicated
 * table just for the 10-minute lifecycle of a verification code.
 */
export async function issueOtp(email: string): Promise<string> {
  const code = randomInt(100000, 1000000).toString();
  const hashed = hashOtp(code, email);
  const expiresAtMs = Date.now() + OTP_TTL_MS;
  const normalized = email.toLowerCase();
  // Purge any outstanding OTPs for this email first — most recent wins.
  await db.execute(sql`DELETE FROM rate_limits WHERE key LIKE ${`nda-otp:${normalized}|%`}`);
  await db.execute(sql`
    INSERT INTO rate_limits (key, tokens, refilled_at)
    VALUES (${`nda-otp:${normalized}|${hashed}`}, ${expiresAtMs}, now())
  `);
  return code;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  const hashed = hashOtp(code, normalized);
  const rows = await db.execute<{ key: string; tokens: number }>(sql`
    SELECT key, tokens FROM rate_limits
    WHERE key = ${`nda-otp:${normalized}|${hashed}`}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return false;
  if (Number(row.tokens) < Date.now()) {
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${row.key}`);
    return false;
  }
  const expected = Buffer.from(hashed, 'hex');
  const actualKeyHash = row.key.slice(`nda-otp:${normalized}|`.length);
  const actual = Buffer.from(actualKeyHash, 'hex');
  if (expected.length !== actual.length) return false;
  const ok = timingSafeEqual(expected, actual);
  if (ok) await db.execute(sql`DELETE FROM rate_limits WHERE key = ${row.key}`);
  return ok;
}

export function fingerprintOtp(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);
}
