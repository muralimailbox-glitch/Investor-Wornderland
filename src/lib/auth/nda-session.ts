import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

export const NDA_SESSION_COOKIE = 'ootaos_nda';
export const NDA_SESSION_TTL_HOURS = 72;

export type NdaSession = {
  leadId: string;
  ndaId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
};

export type NdaSigningToken = {
  email: string;
  leadId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function signPayload(payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = b64url(createHmac('sha256', env.AUTH_SECRET).update(body).digest());
  return `${body}.${mac}`;
}

function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expected = createHmac('sha256', env.AUTH_SECRET).update(body).digest();
  const provided = b64urlDecode(mac);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    const decoded = JSON.parse(b64urlDecode(body).toString('utf8')) as T;
    return decoded;
  } catch {
    return null;
  }
}

export function issueNdaSession(input: { leadId: string; ndaId: string; email: string }): {
  cookieValue: string;
  maxAgeSeconds: number;
  expiresAt: Date;
} {
  const now = Date.now();
  const ttlMs = NDA_SESSION_TTL_HOURS * 60 * 60 * 1000;
  const session: NdaSession = {
    leadId: input.leadId,
    ndaId: input.ndaId,
    email: input.email.toLowerCase(),
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
  return {
    cookieValue: signPayload(session as unknown as Record<string, unknown>),
    maxAgeSeconds: Math.floor(ttlMs / 1000),
    expiresAt: new Date(session.expiresAt),
  };
}

export function readNdaSession(cookieValue: string | undefined | null): NdaSession | null {
  if (!cookieValue) return null;
  const decoded = verifyPayload<NdaSession>(cookieValue);
  if (!decoded) return null;
  if (decoded.expiresAt < Date.now()) return null;
  return decoded;
}

export function issueSigningToken(input: { email: string; leadId: string }): {
  token: string;
  expiresAt: Date;
} {
  const now = Date.now();
  const ttlMs = 10 * 60 * 1000;
  const payload: NdaSigningToken = {
    email: input.email.toLowerCase(),
    leadId: input.leadId,
    issuedAt: now,
    expiresAt: now + ttlMs,
    nonce: b64url(randomBytes(16)),
  };
  return {
    token: signPayload(payload as unknown as Record<string, unknown>),
    expiresAt: new Date(payload.expiresAt),
  };
}

export function readSigningToken(token: string): NdaSigningToken | null {
  const decoded = verifyPayload<NdaSigningToken>(token);
  if (!decoded) return null;
  if (decoded.expiresAt < Date.now()) return null;
  return decoded;
}
