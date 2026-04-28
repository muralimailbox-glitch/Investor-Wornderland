import {
  getFirmById,
  getInvestorByEmail,
  getLatestLeadForInvestor,
  getLatestNdaForLead,
  resetRateLimitKey,
} from './helpers/db';
import { expect, test } from './helpers/fixtures';
import { waitForOutboxEmail } from './helpers/mail';
import {
  completeNdaWithRealOtp,
  createExpiredSigningToken,
  signNda,
  startAndReadNdaOtp,
  startNda,
  verifyNdaOtp,
} from './helpers/nda';

test.describe('NDA Signing', () => {
  // sealNda + PDF generation can be slow on first warm-up; 60s gives safe headroom.
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    // All NDA routes share the same IP bucket ('unknown' in test env).
    // Reset before each test so rate limits from prior tests don't bleed in.
    await Promise.all([
      resetRateLimitKey('nda:initiate:unknown'),
      resetRateLimitKey('nda:verify:unknown'),
      resetRateLimitKey('nda:sign:unknown'),
    ]);
  });

  test('valid nda otp verify returns signing token', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndaverify');
    const otp = await startAndReadNdaOtp(founderApi, email);
    const res = await founderApi.post('/api/v1/nda/verify', { data: { email, otp } });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { token: string; expiresAt: string };
    expect(body.token).toBeTruthy();
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('investor can sign nda and receive nda session', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndasign');
    const otp = await startAndReadNdaOtp(founderApi, email);
    const verified = await verifyNdaOtp(founderApi, email, otp);
    const res = await founderApi.post('/api/v1/nda/sign', {
      data: {
        token: verified.token,
        name: 'Asha Investor',
        title: 'Partner',
        firm: 'Test Capital',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { ndaId: string; leadId: string; downloadUrl: string };
    expect(body.ndaId).toBeTruthy();
    expect(body.leadId).toBeTruthy();
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('ootaos_nda=');
  });

  test('signed nda creates sealed pdf metadata record', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndapdf');
    const result = await completeNdaWithRealOtp(founderApi, {
      email,
      name: 'Asha Investor',
      title: 'Partner',
      firm: 'Test Capital',
    });
    const nda = await getLatestNdaForLead(result.leadId);
    expect(nda).not.toBeNull();
    expect(nda!.signerName).toBe('Asha Investor');
    expect(nda!.signerFirm).toBe('Test Capital');
    expect(nda!.signedPdfR2Key).toBeTruthy();
    expect(nda!.signedPdfSha256).toBeTruthy();
  });

  test('placeholder investor identity is enriched after nda sign', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndaenrich');
    await startNda(founderApi, email);
    const investorBefore = await getInvestorByEmail(email);
    expect(investorBefore!.lastName).toBe('—');

    const otp = await startAndReadNdaOtp(founderApi, email);
    const { token } = await verifyNdaOtp(founderApi, email, otp);
    await signNda(founderApi, { token, name: 'Ravi Kumar', title: 'GP', firm: 'Ravi Ventures' });

    const investorAfter = await getInvestorByEmail(email);
    expect(investorAfter!.firstName).toBe('Ravi');
    expect(investorAfter!.lastName).toBe('Kumar');
    expect(investorAfter!.title).toBe('GP');
  });

  test('placeholder firm is replaced or reused from signer entered firm', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndafirm');
    const uniqueFirm = `Unique-Firm-${Date.now()}`;
    await completeNdaWithRealOtp(founderApi, { email, firm: uniqueFirm });

    const investor = await getInvestorByEmail(email);
    expect(investor).not.toBeNull();
    const firm = await getFirmById(investor!.firmId);
    expect(firm).not.toBeNull();
    expect(firm!.name).toBe(uniqueFirm);
  });

  test('lead auto advances to nda_signed on successful sign', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndaleadstage');
    await completeNdaWithRealOtp(founderApi, { email });

    const investor = await getInvestorByEmail(email);
    const lead = await getLatestLeadForInvestor(investor!.id);
    expect(lead!.stage).toBe('nda_signed');
  });

  test('founder notification is emitted after nda sign', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndanotify');
    await completeNdaWithRealOtp(founderApi, {
      email,
      name: 'Notify Signer',
      firm: 'Notify Capital',
    });

    const founderEmail = process.env.SMTP_FROM!;
    const row = await waitForOutboxEmail(founderEmail, 'NDA signed');
    expect(row).not.toBeNull();
    expect(row.subject).toContain('Notify Signer');
  });

  test('expired signing token is rejected', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndaexpired');
    await startNda(founderApi, email);
    const investor = await getInvestorByEmail(email);
    const lead = await getLatestLeadForInvestor(investor!.id);
    const expiredToken = createExpiredSigningToken(email, lead!.id);

    const res = await founderApi.post('/api/v1/nda/sign', {
      data: { token: expiredToken, name: 'Asha', title: 'Partner', firm: 'Cap' },
    });
    expect(res.status()).toBe(400);
  });

  test('tampered signing token is rejected', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('ndatamper');
    const otp = await startAndReadNdaOtp(founderApi, email);
    const { token } = await verifyNdaOtp(founderApi, email, otp);

    const parts = token.split('.');
    const lastChar = parts[0]!.slice(-1);
    const flipped = lastChar === 'a' ? 'b' : 'a';
    const tamperedToken = `${parts[0]!.slice(0, -1)}${flipped}.${parts[1]}`;

    const res = await founderApi.post('/api/v1/nda/sign', {
      data: { token: tamperedToken, name: 'Asha', title: 'Partner', firm: 'Cap' },
    });
    expect(res.status()).toBe(400);
  });

  test('duplicate nda sign submit does not create corrupt duplicate state', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('ndaduplicate');
    const otp = await startAndReadNdaOtp(founderApi, email);
    const { token } = await verifyNdaOtp(founderApi, email, otp);

    const signInput = { token, name: 'Asha Investor', title: 'Partner', firm: 'Test Capital' };
    const first = await signNda(founderApi, signInput);
    // Second submit with the same still-valid token — must not corrupt lead state
    await signNda(founderApi, signInput);

    const investor = await getInvestorByEmail(email);
    const lead = await getLatestLeadForInvestor(investor!.id);
    expect(lead!.stage).toBe('nda_signed');
    expect(lead!.id).toBe(first.leadId);
  });
});
