import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

export const CHALLENGE_TTL_MS = 30 * 60 * 1000;
export const CHALLENGE_MIN_AGE_MS = 800;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export type ChallengePurpose = 'login';

export function signChallenge(purpose: ChallengePurpose): string {
  const body = b64url(
    Buffer.from(
      JSON.stringify({
        p: purpose,
        t: Date.now(),
        n: randomBytes(12).toString('hex'),
      }),
      'utf8',
    ),
  );
  const mac = b64url(createHmac('sha256', env.AUTH_SECRET).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyChallenge(
  token: string | undefined | null,
  purpose: ChallengePurpose,
): { ok: true } | { ok: false; reason: string } {
  if (!token) return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, mac] = parts as [string, string];
  const expected = createHmac('sha256', env.AUTH_SECRET).update(body).digest();
  const provided = b64urlDecode(mac);
  if (expected.length !== provided.length) return { ok: false, reason: 'bad_mac' };
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: 'bad_mac' };
  try {
    const decoded = JSON.parse(b64urlDecode(body).toString('utf8')) as {
      p?: string;
      t?: number;
      n?: string;
    };
    if (decoded.p !== purpose) return { ok: false, reason: 'wrong_purpose' };
    if (typeof decoded.t !== 'number') return { ok: false, reason: 'bad_time' };
    const age = Date.now() - decoded.t;
    if (age < CHALLENGE_MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
    if (age > CHALLENGE_TTL_MS) return { ok: false, reason: 'expired' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
