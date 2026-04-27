import { expect, type APIRequestContext } from '@playwright/test';

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

export async function expectLoungeAccess(api: APIRequestContext) {
  const res = await api.get('/api/v1/lounge');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as unknown;
}
