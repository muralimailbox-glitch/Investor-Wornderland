import { randomUUID } from 'node:crypto';

import {
  getLatestInteraction,
  resetRateLimitKey,
  setDocumentDealId,
  setDocumentExpired,
} from './helpers/db';
import { expect, test } from './helpers/fixtures';
import { deleteDocument, replaceDocument, uploadDocument } from './helpers/founder';
import { completeNdaWithRealOtp } from './helpers/nda';

test.describe('Document Delivery', () => {
  test.beforeEach(async () => {
    await resetRateLimitKey('nda:initiate:unknown');
    await resetRateLimitKey('nda:verify:unknown');
    await resetRateLimitKey('nda:sign:unknown');
  });

  test('signed investor can open pdf document inline', async ({ founderApi, makeEmail }) => {
    const doc = await uploadDocument(founderApi, { filename: 'deck.pdf', watermarkPolicy: 'none' });
    const email = makeEmail('docpdf');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    expect(res.headers()['content-disposition']).toContain('inline');
  });

  test('signed investor can open non pdf document when allowed', async ({
    founderApi,
    makeEmail,
  }) => {
    const content = Buffer.from('# Meeting notes\n\nThis is a test document.');
    const doc = await uploadDocument(founderApi, {
      filename: 'notes.txt',
      content,
      mimeType: 'text/plain',
      watermarkPolicy: 'none',
    });
    const email = makeEmail('docnonpdf');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/plain');
  });

  test('soft deleted document is no longer accessible', async ({ founderApi, makeEmail }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'todelete.pdf',
      watermarkPolicy: 'none',
    });
    // Delete BEFORE completing NDA so the cookie jar state is clean when we fetch.
    await deleteDocument(founderApi, doc.id);
    const email = makeEmail('docdelete');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(404);
  });

  test('expired document is no longer accessible', async ({ founderApi, makeEmail }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'expiring.pdf',
      watermarkPolicy: 'none',
      expiresInDays: 1,
    });
    const email = makeEmail('docexpired');
    await completeNdaWithRealOtp(founderApi, { email });
    await setDocumentExpired(doc.id);

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(404);
  });

  test('document from another deal cannot be fetched by current investor', async ({
    founderApi,
    makeEmail,
  }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'otherdeal.pdf',
      watermarkPolicy: 'none',
    });
    // Overwrite the document's dealId to simulate it belonging to a different deal.
    await setDocumentDealId(doc.id, randomUUID());
    const email = makeEmail('docotherdeal');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(404);
  });

  test('stage locked document fetch returns authorization error', async ({
    founderApi,
    makeEmail,
  }) => {
    // diligence (stage 6) > nda_signed (stage 4), so an nda_signed investor cannot access this.
    const doc = await uploadDocument(founderApi, {
      filename: 'diligence-pack.pdf',
      watermarkPolicy: 'none',
      minLeadStage: 'diligence',
    });
    const email = makeEmail('docstage');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(403);
  });

  test('document fetch writes document_viewed interaction', async ({ founderApi, makeEmail }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'viewed.pdf',
      watermarkPolicy: 'none',
    });
    const email = makeEmail('docviewed');
    const { leadId } = await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(200);

    const interaction = await getLatestInteraction({ leadId, kind: 'document_viewed' });
    expect(interaction).not.toBeNull();
    expect((interaction?.payload as Record<string, unknown>)?.documentId).toBe(doc.id);
  });

  test('document filename is safely emitted in content disposition', async ({
    founderApi,
    makeEmail,
  }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'investor-report-2024.pdf',
      watermarkPolicy: 'none',
    });
    const email = makeEmail('docfilename');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(200);
    const disposition = res.headers()['content-disposition'] ?? '';
    expect(disposition).toContain('inline');
    expect(disposition).toContain('investor-report-2024.pdf');
  });

  test('direct document fetch without nda cookie is rejected', async ({
    founderApi,
    playwright,
    baseURL,
  }) => {
    const doc = await uploadDocument(founderApi, {
      filename: 'nocookie.pdf',
      watermarkPolicy: 'none',
    });

    const anonApi = await playwright.request.newContext(baseURL ? { baseURL } : {});
    try {
      const res = await anonApi.get(`/api/v1/document/${doc.id}`);
      expect(res.status()).toBe(401);
    } finally {
      await anonApi.dispose();
    }
  });

  test('replaced document serves only latest live version', async ({ founderApi, makeEmail }) => {
    const originalContent = Buffer.from('%PDF-1.4\n%original-v1\n');
    const replacementContent = Buffer.from('%PDF-1.4\n%replacement-v2\n');

    const doc = await uploadDocument(founderApi, {
      filename: 'versioned.pdf',
      content: originalContent,
      watermarkPolicy: 'none',
    });
    await replaceDocument(founderApi, doc.id, {
      filename: 'versioned.pdf',
      content: replacementContent,
    });
    const email = makeEmail('docreplace');
    await completeNdaWithRealOtp(founderApi, { email });

    const res = await founderApi.get(`/api/v1/document/${doc.id}`);
    expect(res.status()).toBe(200);
    const body = await res.body();
    // Verify the response contains the replacement bytes, not the original.
    expect(body.toString()).toContain('%replacement-v2');
    expect(body.toString()).not.toContain('%original-v1');
  });
});
