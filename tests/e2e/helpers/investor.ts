import { expect, type APIRequestContext, type Page } from '@playwright/test';

function asApi(client: APIRequestContext | Page): APIRequestContext {
  return 'goto' in client ? client.context().request : client;
}

export async function redeemInvite(page: Page, inviteUrl: string): Promise<void> {
  const res = await page.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
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
