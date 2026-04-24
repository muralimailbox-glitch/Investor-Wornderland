import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

export const PREVIEW_COOKIE = 'ootaos_preview';
export const PREVIEW_TTL_MINUTES = 30;

export type PreviewSession = {
  founderId: string;
  workspaceId: string;
  investorId: string | null;
  issuedAt: number;
  expiresAt: number;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signPreviewToken(input: {
  founderId: string;
  workspaceId: string;
  investorId?: string | null;
}): { cookieValue: string; maxAgeSeconds: number; expiresAt: Date } {
  const now = Date.now();
  const ttlMs = PREVIEW_TTL_MINUTES * 60 * 1000;
  const session: PreviewSession = {
    founderId: input.founderId,
    workspaceId: input.workspaceId,
    investorId: input.investorId ?? null,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
  const body = b64url(Buffer.from(JSON.stringify(session), 'utf8'));
  const mac = b64url(createHmac('sha256', env.AUTH_SECRET).update(body).digest());
  return {
    cookieValue: `${body}.${mac}`,
    maxAgeSeconds: Math.floor(ttlMs / 1000),
    expiresAt: new Date(session.expiresAt),
  };
}

export function verifyPreviewToken(cookieValue: string | undefined | null): PreviewSession | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expected = createHmac('sha256', env.AUTH_SECRET).update(body).digest();
  const provided = b64urlDecode(mac);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    const decoded = JSON.parse(b64urlDecode(body).toString('utf8')) as PreviewSession;
    if (decoded.expiresAt < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
