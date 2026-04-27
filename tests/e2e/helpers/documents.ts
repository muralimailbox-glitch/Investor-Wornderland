import { expect, type APIRequestContext } from '@playwright/test';

export type UploadDocumentInput = {
  filename?: string;
  mimeType?: string;
  content?: Buffer;
  kind?:
    | 'pitch_deck'
    | 'financial_model'
    | 'customer_refs'
    | 'tech_arch'
    | 'cap_table'
    | 'product_demo'
    | 'term_sheet'
    | 'other';
  title?: string;
  watermarkPolicy?: 'per_investor' | 'static' | 'none';
  expiresInDays?: number;
  minLeadStage?:
    | 'prospect'
    | 'contacted'
    | 'engaged'
    | 'nda_pending'
    | 'nda_signed'
    | 'meeting_scheduled'
    | 'diligence'
    | 'term_sheet'
    | 'funded'
    | 'closed_lost';
};

export async function uploadDocument(api: APIRequestContext, input: UploadDocumentInput = {}) {
  const res = await api.post('/api/v1/admin/documents', {
    multipart: {
      kind: input.kind ?? 'pitch_deck',
      title: input.title ?? 'E2E Test Deck',
      watermarkPolicy: input.watermarkPolicy ?? 'per_investor',
      ...(input.expiresInDays ? { expiresInDays: String(input.expiresInDays) } : {}),
      ...(input.minLeadStage ? { minLeadStage: input.minLeadStage } : {}),
      file: {
        name: input.filename ?? 'deck.pdf',
        mimeType: input.mimeType ?? 'application/pdf',
        buffer: input.content ?? Buffer.from('%PDF-1.4\n% E2E test pdf\n'),
      },
    },
  });

  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    document: {
      id: string;
      originalFilename: string;
      watermarkPolicy: 'per_investor' | 'static' | 'none';
      minLeadStage: string | null;
    };
  };
}

export async function listDocuments(api: APIRequestContext) {
  const res = await api.get('/api/v1/admin/documents');
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { documents: Array<Record<string, unknown>> };
}

export async function fetchInvestorDocument(api: APIRequestContext, documentId: string) {
  return api.get(`/api/v1/document/${documentId}`);
}

export async function expectInlinePdf(res: Awaited<ReturnType<typeof fetchInvestorDocument>>) {
  expect(res.ok()).toBeTruthy();
  const headers = res.headers();
  expect(headers['content-type']).toContain('application/pdf');
  expect(headers['content-disposition']).toContain('inline;');
}
