import { getInvestorByEmail, getLatestLeadForInvestor, resetRateLimitKey } from './helpers/db';
import { expect, test } from './helpers/fixtures';
import { createInvestor } from './helpers/founder';
import { waitForOutboxEmail } from './helpers/mail';
import { startNda } from './helpers/nda';

test.describe('Public NDA Initiation', () => {
  // Next.js dev-server compilation on first request can add 15-20s; 60s gives safe headroom.
  test.setTimeout(60_000);

  test('public nda initiate creates placeholder investor and lead for unknown email', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndainit');
    const res = await startNda(founderApi, email);
    expect(res.sent).toBe(true);

    const investor = await getInvestorByEmail(email);
    expect(investor).not.toBeNull();

    const lead = await getLatestLeadForInvestor(investor!.id);
    expect(lead).not.toBeNull();
    expect(lead!.stage).toBe('nda_pending');
  });

  test('public nda initiate reuses existing investor if email already exists', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndareusei');
    const existing = await createInvestor(founderApi, { email });

    // Initiate NDA with the same email — must find the existing investor, not create a new one
    const res = await startNda(founderApi, email);
    expect(res.sent).toBe(true);

    const dbInvestor = await getInvestorByEmail(email);
    expect(dbInvestor).not.toBeNull();
    expect(dbInvestor!.id).toBe(existing.id);
  });

  test('repeat nda initiate for same investor reuses active lead on active deal', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndareuse');
    await startNda(founderApi, email);
    const investor = await getInvestorByEmail(email);
    expect(investor).not.toBeNull();
    const firstLead = await getLatestLeadForInvestor(investor!.id);
    expect(firstLead).not.toBeNull();

    // Second initiate — should not create a second lead
    await startNda(founderApi, email);
    const secondLead = await getLatestLeadForInvestor(investor!.id);
    expect(secondLead!.id).toBe(firstLead!.id);
  });

  test('early stage lead advances to nda_pending during self serve nda', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndaadvance');
    // createInvestor triggers ensureActiveLead which creates a lead at 'prospect'
    const investor = await createInvestor(founderApi, { email });
    const leadBefore = await getLatestLeadForInvestor(investor.id);
    expect(leadBefore!.stage).toBe('prospect');

    // Self-serve NDA initiation should advance the existing 'prospect' lead to 'nda_pending'
    await startNda(founderApi, email);
    const leadAfter = await getLatestLeadForInvestor(investor.id);
    expect(leadAfter!.id).toBe(leadBefore!.id);
    expect(leadAfter!.stage).toBe('nda_pending');
  });

  test('invalid email on nda initiate returns 4xx', async ({ founderApi }) => {
    const res = await founderApi.post('/api/v1/nda/initiate', {
      data: { email: 'not-an-email' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test.skip('nda initiate fails closed when no active deal exists', () => {
    // Requires globally deleting all deals from the test DB — destructive to
    // shared state. resolvePublicFundraiseContext() selects by most-recent
    // createdAt with no active/inactive flag; there is no safe per-test reset.
  });

  test.skip('nda initiate fails closed when founder workspace context is missing', () => {
    // Requires deleting the founder user — destructive to shared test state.
  });

  test('nda initiate normalizes uppercase email to lowercase', async ({
    founderApi,
    makeEmail,
  }) => {
    const emailLower = makeEmail('ndanorm');
    const emailUpper = emailLower.toUpperCase();

    const res = await startNda(founderApi, emailUpper);
    expect(res.sent).toBe(true);

    // The investor should be findable by the lowercase version
    const investor = await getInvestorByEmail(emailLower);
    expect(investor).not.toBeNull();
    expect(investor!.email.toLowerCase()).toBe(emailLower);
  });

  test('nda otp requests are throttled after repeated attempts', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndathrottle');
    // MAX_ISSUANCES_PER_WINDOW = 3 — first three succeed
    for (let i = 0; i < 3; i++) {
      const res = await founderApi.post('/api/v1/nda/initiate', { data: { email } });
      expect(res.ok()).toBeTruthy();
    }
    // Fourth triggers too_many_otps → 429
    const res = await founderApi.post('/api/v1/nda/initiate', { data: { email } });
    expect(res.status()).toBe(429);
  });

  test('nda initiate records outbound otp email in outbox', async ({ founderApi, makeEmail }) => {
    // Reset the shared IP rate-limit bucket — prior tests may have drained it.
    await resetRateLimitKey('nda:initiate:unknown');
    const email = makeEmail('ndaoutbox');
    await startNda(founderApi, email);
    const row = await waitForOutboxEmail(email, 'NDA verification code');
    expect(row).not.toBeNull();
    expect(row.toEmail).toBe(email);
  });
});
