import { expect, type APIRequestContext, type Page } from '@playwright/test';

function asApi(client: APIRequestContext | Page): APIRequestContext {
  return 'goto' in client ? client.context().request : client;
}

export async function redeemInvite(page: Page, inviteUrl: string): Promise<void> {
  // The API builds the URL using NEXT_PUBLIC_SITE_URL (production domain).
  // In tests we navigate by pathname only so Playwright applies its baseURL (localhost).
  const path = new URL(inviteUrl).pathname;
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(res).not.toBeNull();
}

export async function getInviteContext(client: APIRequestContext | Page) {
  const api = asApi(client);
  const res = await api.get('/api/v1/invite/context');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    authenticated: boolean;
    investorId?: string;
    firstName?: string;
    lastName?: string | null;
    firmName?: string | null;
    expiresAt?: string;
  };
}

export async function expectInvestorAuthenticated(client: APIRequestContext | Page) {
  const ctx = await getInviteContext(client);
  expect(ctx.authenticated).toBe(true);
  return ctx;
}

export async function clearInvestorSession(page: Page) {
  await page.context().clearCookies();
}

export async function openAsk(page: Page) {
  await page.goto('/ask', { waitUntil: 'domcontentloaded' });
}

export async function openLounge(page: Page) {
  await page.goto('/lounge', { waitUntil: 'domcontentloaded' });
}

/**
 * Probe whether the investor session in the page's cookies passes the
 * DB-level revocation check (not just the stateless HMAC verify).
 * Uses /api/v1/concierge-feedback which calls getInvestorContext() internally.
 * Returns true if the session is active, false if rejected (missing/revoked).
 */
export async function probeInvestorDataAccess(page: Page): Promise<boolean> {
  const res = await page.context().request.post('/api/v1/concierge-feedback', {
    data: { sessionId: 'probe-e2e', question: 'probe', answer: 'probe', rating: 'up' },
  });
  // Only 200 or 429 (rate-limited but authenticated) count as "access granted".
  // A 500 must not be treated as granted — that would mask broken revocation.
  return res.ok() || res.status() === 429;
}
