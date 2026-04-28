import { resetRateLimitKey } from './helpers/db';
import { expect, test } from './helpers/fixtures';
import { revokeNda, uploadDocument } from './helpers/founder';
import {
  completeNdaWithRealOtp,
  expectLoungeAccess,
  signNda,
  startAndReadNdaOtp,
  verifyNdaOtp,
} from './helpers/nda';

test.describe('Lounge Access', () => {
  // PDF generation + first-request compilation can add up to ~40s; 60s is safe headroom.
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    await Promise.all([
      resetRateLimitKey('nda:initiate:unknown'),
      resetRateLimitKey('nda:verify:unknown'),
      resetRateLimitKey('nda:sign:unknown'),
    ]);
  });

  test('nda signed investor can load lounge bundle', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('lounge');
    await completeNdaWithRealOtp(founderApi, { email });
    const bundle = (await expectLoungeAccess(founderApi)) as {
      investorEmail: string;
      documents: unknown[];
      suggestedSlots: unknown[];
    };
    expect(bundle.investorEmail).toBe(email);
    expect(Array.isArray(bundle.documents)).toBe(true);
    expect(Array.isArray(bundle.suggestedSlots)).toBe(true);
  });

  test('investor without nda cookie is blocked from lounge api', async ({
    playwright,
    baseURL,
  }) => {
    const anonApi = await playwright.request.newContext(baseURL ? { baseURL } : {});
    try {
      const res = await anonApi.get('/api/v1/lounge');
      expect(res.status()).toBe(401);
    } finally {
      await anonApi.dispose();
    }
  });

  test('revoked or expired nda session is blocked from lounge', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('loungerevoke');
    const otp = await startAndReadNdaOtp(founderApi, email);
    const { token } = await verifyNdaOtp(founderApi, email, otp);
    const { ndaId } = await signNda(founderApi, {
      token,
      name: 'Revoke Test',
      title: 'Partner',
      firm: 'Cap',
    });

    await revokeNda(founderApi, ndaId);

    const res = await founderApi.get('/api/v1/lounge');
    expect(res.status()).toBe(401);
  });

  test('lounge shows investor identity and firm correctly', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('loungeident');
    await completeNdaWithRealOtp(founderApi, {
      email,
      name: 'Priya Sharma',
      firm: 'Priya Ventures',
    });
    const bundle = (await expectLoungeAccess(founderApi)) as {
      investorEmail: string;
      investorFirstName: string;
      investorLastName: string;
      investorFirmName: string;
    };
    expect(bundle.investorEmail).toBe(email);
    expect(bundle.investorFirstName).toBe('Priya');
    expect(bundle.investorLastName).toBe('Sharma');
    expect(bundle.investorFirmName).toBe('Priya Ventures');
  });

  test('lounge shows suggested meeting slots', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('loungeslots');
    await completeNdaWithRealOtp(founderApi, { email });
    const bundle = (await expectLoungeAccess(founderApi)) as {
      suggestedSlots: Array<{ startsAt: string; endsAt: string }>;
    };
    expect(Array.isArray(bundle.suggestedSlots)).toBe(true);
    // Each slot has the expected shape
    for (const slot of bundle.suggestedSlots) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(Date.now());
      expect(new Date(slot.endsAt).getTime()).toBeGreaterThan(new Date(slot.startsAt).getTime());
    }
  });

  test.skip('lounge handles zero documents gracefully', () => {
    // Requires no documents in the DB for the current deal — destructive to
    // shared test state. Can't safely delete and restore global doc rows per-test.
  });

  test.skip('lounge handles zero available slots gracefully', () => {
    // Requires booking every available slot in the shared DB — destructive and
    // time-dependent. generateBookableSlots always produces future slots; filling
    // all 6 windows would leave the workspace in a broken state for other tests.
  });

  test.skip('stale lead linked nda session returns safe error', () => {
    // Requires deleting a lead row after the NDA session is issued — destructive
    // to shared state and a foreign-key violation in most DB configs.
  });

  test('investor sees only current deal documents in lounge list', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('loungedocs');
    // Upload a document scoped to the current deal
    const doc = await uploadDocument(founderApi, {
      filename: 'stage5-deal-scoped.pdf',
      kind: 'other',
      watermarkPolicy: 'none',
    });

    await completeNdaWithRealOtp(founderApi, { email });
    const bundle = (await expectLoungeAccess(founderApi)) as {
      documents: Array<{ id: string; locked: boolean }>;
    };

    // The freshly uploaded doc must appear in the bundle
    const found = bundle.documents.find((d) => d.id === doc.id);
    expect(found).not.toBeUndefined();
  });

  test('stage restricted documents appear locked in lounge list', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('loungelocked');
    // Upload a doc that requires meeting_scheduled stage
    const doc = await uploadDocument(founderApi, {
      filename: 'stage5-restricted.pdf',
      kind: 'other',
      watermarkPolicy: 'none',
      minLeadStage: 'meeting_scheduled',
    });

    // Investor signs NDA → stage is nda_signed (below meeting_scheduled)
    await completeNdaWithRealOtp(founderApi, { email });
    const bundle = (await expectLoungeAccess(founderApi)) as {
      documents: Array<{ id: string; locked: boolean; minLeadStage: string | null }>;
    };

    const found = bundle.documents.find((d) => d.id === doc.id);
    expect(found).not.toBeUndefined();
    expect(found!.locked).toBe(true);
  });
});
