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
  // The login route enforces a minimum challenge age (800ms) to block replay.
  // On a warm dev server the round-trip is faster than that, so we wait.
  await new Promise((r) => setTimeout(r, 900));

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
  /** Use an existing firm by ID instead of creating one by name. */
  firmId?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  decisionAuthority?: string;
  timezone?: string;
  firmName?: string;
  firmType?: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate';
};

export async function createInvestor(api: APIRequestContext, input: CreateInvestorInput) {
  const firmFields = input.firmId
    ? { firmId: input.firmId }
    : { firmName: input.firmName ?? 'Test Capital', firmType: input.firmType ?? 'vc' };
  const payload = {
    ...firmFields,
    firstName: input.firstName ?? 'Asha',
    lastName: input.lastName ?? 'Investor',
    title: input.title ?? 'Partner',
    decisionAuthority: input.decisionAuthority ?? 'partner',
    email: input.email,
    timezone: input.timezone ?? 'Asia/Kolkata',
  };

  const res = await api.post('/api/v1/admin/investors', { data: payload });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { id: string; email: string; firmId: string };
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

export async function revokeNda(api: APIRequestContext, ndaId: string) {
  const res = await api.post(`/api/v1/admin/ndas/${ndaId}/revoke`, { data: {} });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { ok: boolean; ndaId: string; revokedAt: string | null };
}

export type UploadDocumentInput = {
  filename?: string;
  content?: Buffer;
  mimeType?: string;
  kind?: string;
  watermarkPolicy?: 'per_investor' | 'static' | 'none';
  minLeadStage?: string | null;
  expiresInDays?: number | null;
};

export async function uploadDocument(api: APIRequestContext, opts: UploadDocumentInput = {}) {
  const filename = opts.filename ?? 'test.pdf';
  const content = opts.content ?? Buffer.from('%PDF-1.4 test document content');
  const mimeType = opts.mimeType ?? 'application/pdf';
  const fields: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    file: { name: filename, mimeType, buffer: content },
    kind: opts.kind ?? 'other',
    watermarkPolicy: opts.watermarkPolicy ?? 'none',
  };
  if (opts.minLeadStage != null) fields.minLeadStage = opts.minLeadStage;
  if (opts.expiresInDays != null) fields.expiresInDays = String(opts.expiresInDays);
  const res = await api.post('/api/v1/admin/documents', { multipart: fields });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    document: { id: string; kind: string; originalFilename?: string };
  };
  return body.document;
}

export async function deleteDocument(api: APIRequestContext, docId: string) {
  const res = await api.delete(`/api/v1/admin/documents/${docId}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { ok: boolean };
}

export async function replaceDocument(
  api: APIRequestContext,
  docId: string,
  opts: { filename?: string; content?: Buffer; mimeType?: string } = {},
) {
  const filename = opts.filename ?? 'replacement.pdf';
  const content = opts.content ?? Buffer.from('%PDF-1.4 replacement content');
  const mimeType = opts.mimeType ?? 'application/pdf';
  const res = await api.put(`/api/v1/admin/documents/${docId}`, {
    multipart: { file: { name: filename, mimeType, buffer: content } },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    document: { id: string; sha256: string };
    archivedVersion: number;
  };
}

/** Import investors from a CSV string (text/csv body). */
export async function importInvestorsCsv(api: APIRequestContext, csvText: string) {
  const res = await api.post('/api/v1/admin/investors/import', {
    headers: { 'Content-Type': 'text/csv' },
    data: csvText,
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    imported: number;
    skipped: number;
    errors: Array<{ row: number; reason: string }>;
  };
}

/** Bulk-import investors via the Tracxn/bulk-import JSON endpoint. */
export async function bulkImportInvestors(
  api: APIRequestContext,
  investors: Array<{
    firmName: string;
    firstName: string;
    lastName: string;
    title: string;
    decisionAuthority: 'full' | 'partial' | 'influencer' | 'none';
    email?: string;
    timezone?: string;
  }>,
) {
  const res = await api.post('/api/v1/admin/investors/bulk-import', {
    data: { investors },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    firmsCreated: number;
    firmsUpdated: number;
    investorsCreated: number;
    investorsUpdated: number;
  };
}
