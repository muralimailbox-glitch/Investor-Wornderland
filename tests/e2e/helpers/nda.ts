import { createHmac, randomBytes } from 'node:crypto';

import { expect, type APIRequestContext } from '@playwright/test';

import { extractSixDigitCode, waitForOutboxEmail } from './mail';

/**
 * Creates a cryptographically valid but already-expired signing token.
 * Replicates the server-side signing logic with a past expiresAt so
 * readSigningToken() rejects it via the expiry check, not the HMAC check.
 */
export function createExpiredSigningToken(email: string, leadId: string): string {
  const secret = process.env.AUTH_SECRET!;
  const b64url = (buf: Buffer) =>
    buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Date.now();
  const payload = {
    email: email.toLowerCase(),
    leadId,
    issuedAt: now - 20 * 60 * 1000,
    expiresAt: now - 10 * 60 * 1000,
    nonce: b64url(randomBytes(16)),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${mac}`;
}

export async function startNda(api: APIRequestContext, email: string) {
  const res = await api.post('/api/v1/nda/initiate', { data: { email } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { sent: true };
}

export async function verifyNdaOtp(api: APIRequestContext, email: string, otp: string) {
  const res = await api.post('/api/v1/nda/verify', {
    data: { email, otp },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { token: string; expiresAt: string };
}

export type SignNdaInput = {
  token: string;
  name?: string | undefined;
  title?: string | undefined;
  firm?: string | undefined;
};

export async function signNda(api: APIRequestContext, input: SignNdaInput) {
  const res = await api.post('/api/v1/nda/sign', {
    data: {
      token: input.token,
      name: input.name ?? 'Asha Investor',
      title: input.title ?? 'Partner',
      firm: input.firm ?? 'Test Capital',
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    ndaId: string;
    leadId: string;
    downloadUrl: string;
  };
}

export async function completeNda(
  api: APIRequestContext,
  input: {
    email: string;
    otp: string;
    name?: string;
    title?: string;
    firm?: string;
  },
) {
  await startNda(api, input.email);
  const verified = await verifyNdaOtp(api, input.email, input.otp);
  return signNda(api, {
    token: verified.token,
    name: input.name,
    title: input.title,
    firm: input.firm,
  });
}

/**
 * Issues an NDA OTP and reads the code directly from the emailOutbox row
 * (initiateNda writes it synchronously). No polling needed in practice, but
 * waitForOutboxEmail retries for up to 15 s as a safety net.
 */
export async function startAndReadNdaOtp(api: APIRequestContext, email: string): Promise<string> {
  await startNda(api, email);
  const row = await waitForOutboxEmail(email, 'NDA verification code');
  return extractSixDigitCode(row.subject);
}

/**
 * Full NDA flow using the real outbox-backed OTP.
 * Does NOT call startNda a second time (unlike completeNda which does).
 */
export async function completeNdaWithRealOtp(
  api: APIRequestContext,
  input: { email: string; name?: string; title?: string; firm?: string },
) {
  const otp = await startAndReadNdaOtp(api, input.email);
  const verified = await verifyNdaOtp(api, input.email, otp);
  return signNda(api, {
    token: verified.token,
    name: input.name,
    title: input.title,
    firm: input.firm,
  });
}

export async function expectLoungeAccess(api: APIRequestContext) {
  const res = await api.get('/api/v1/lounge');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as unknown;
}
