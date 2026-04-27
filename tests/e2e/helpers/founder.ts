import { expect, type APIRequestContext, type Page } from '@playwright/test';

function founderCreds() {
  const email = process.env.PW_FOUNDER_EMAIL ?? process.env.FOUNDER_EMAIL;
  const password = process.env.PW_FOUNDER_PASSWORD ?? process.env.FOUNDER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing founder creds. Set PW_FOUNDER_EMAIL/PW_FOUNDER_PASSWORD or FOUNDER_EMAIL/FOUNDER_PASSWORD.',
    );
  }

  return { email, password };
}

export async function getLoginChallenge(api: APIRequestContext): Promise<string> {
  const res = await api.get('/api/v1/admin/auth/login-challenge');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { challenge: string };
  return body.challenge;
}

export async function loginFounderApi(api: APIRequestContext): Promise<void> {
  const creds = founderCreds();
  const challenge = await getLoginChallenge(api);

  const res = await api.post('/api/v1/admin/auth/login', {
    data: {
      email: creds.email,
      password: creds.password,
      challenge,
      hp: '',
    },
  });

  expect(res.ok()).toBeTruthy();
}

export async function loginFounderPage(page: Page): Promise<void> {
  await loginFounderApi(page.context().request);
  await page.goto('/cockpit', { waitUntil: 'domcontentloaded' });
}

export type CreateInvestorInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  decisionAuthority?: string;
  timezone?: string;
  firmName?: string;
  firmType?: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate';
};

export async function createInvestor(api: APIRequestContext, input: CreateInvestorInput) {
  const payload = {
    firmName: input.firmName ?? 'Test Capital',
    firmType: input.firmType ?? 'vc',
    firstName: input.firstName ?? 'Asha',
    lastName: input.lastName ?? 'Investor',
    title: input.title ?? 'Partner',
    decisionAuthority: input.decisionAuthority ?? 'partner',
    email: input.email,
    timezone: input.timezone ?? 'Asia/Kolkata',
  };

  const res = await api.post('/api/v1/admin/investors', { data: payload });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; email: string; firmId?: string | null };
}

export async function listInvestors(api: APIRequestContext, query = '') {
  const res = await api.get(`/api/v1/admin/investors${query}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as unknown;
}

export async function issueInviteLink(
  api: APIRequestContext,
  investorId: string,
  body: { sendEmail?: boolean; introLine?: string } = {},
) {
  const res = await api.post(`/api/v1/admin/investors/${investorId}/invite-link`, { data: body });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    url: string;
    expiresAt: string;
    investorEmail: string;
  };
}

export async function revokeInviteLinks(
  api: APIRequestContext,
  investorId: string,
  reason = 'e2e revoke',
) {
  const res = await api.post(`/api/v1/admin/investors/${investorId}/revoke-links`, {
    data: { reason },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { ok: boolean; revokedBefore: string };
}

export async function getCurrentDeal(api: APIRequestContext) {
  const res = await api.get('/api/v1/admin/deals/current');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as null | { id: string; roundLabel: string };
}
