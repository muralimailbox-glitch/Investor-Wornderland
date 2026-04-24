import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '@/lib/env';

export const INVESTOR_COOKIE = 'ootaos_investor';
export const INVESTOR_LINK_TTL_DAYS = 14;

export type InvestorLinkSession = {
  investorId: string;
  workspaceId: string;
  firmId: string | null;
  firstName: string;
  lastName: string | null;
  firmName: string | null;
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

export function signInvestorLink(input: {
  investorId: string;
  workspaceId: string;
  firmId: string | null;
  firstName: string;
  lastName: string | null;
  firmName: string | null;
}): { token: string; maxAgeSeconds: number; expiresAt: Date } {
  const now = Date.now();
  const ttlMs = INVESTOR_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;
  const session: InvestorLinkSession = {
    investorId: input.investorId,
    workspaceId: input.workspaceId,
    firmId: input.firmId,
    firstName: input.firstName,
    lastName: input.lastName,
    firmName: input.firmName,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };
  const body = b64url(Buffer.from(JSON.stringify(session), 'utf8'));
  const mac = b64url(createHmac('sha256', env.AUTH_SECRET).update(body).digest());
  return {
    token: `${body}.${mac}`,
    maxAgeSeconds: Math.floor(ttlMs / 1000),
    expiresAt: new Date(session.expiresAt),
  };
}

export function verifyInvestorLink(token: string | undefined | null): InvestorLinkSession | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expected = createHmac('sha256', env.AUTH_SECRET).update(body).digest();
  const provided = b64urlDecode(mac);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    const decoded = JSON.parse(b64urlDecode(body).toString('utf8')) as InvestorLinkSession;
    if (typeof decoded.expiresAt !== 'number' || decoded.expiresAt < Date.now()) return null;
    if (!decoded.investorId || !decoded.workspaceId) return null;
    return decoded;
  } catch {
    return null;
  }
}
