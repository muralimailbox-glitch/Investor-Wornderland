import { expireOtpForEmail, getInvestorByEmail, getLatestInteraction } from './helpers/db';
import { expect, test } from './helpers/fixtures';
import { createInvestor, issueInviteLink } from './helpers/founder';
import {
  redeemInvite,
  startAndReadInvestorEmailOtp,
  startInvestorEmailOtp,
  verifyInvestorEmail,
} from './helpers/investor';
import { extractSixDigitCode, waitForOutboxEmail } from './helpers/mail';

test.describe('Investor Email Verification', () => {
  // redeemInvite follows the NEXT_PUBLIC_SITE_URL redirect (production site) which
  // can take 20-25s. The rest of the test adds 5-10s, so 60s gives safe headroom.
  test.setTimeout(60_000);

  test('investor can verify matching email with valid otp', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('verify');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    const code = await startAndReadInvestorEmailOtp(page, email);
    const res = await verifyInvestorEmail(page, email, code);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.emailVerified).toBe(true);
    expect(body.emailUpdated).toBe(false);
  });

  test('investor can update email during verification when email is unique', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const emailA = makeEmail('updateA');
    const emailB = makeEmail('updateB');
    const investor = await createInvestor(founderApi, { email: emailA });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    // Issue OTP for emailB (the new email to claim)
    const startRes = await startInvestorEmailOtp(page, emailB);
    expect(startRes.ok()).toBeTruthy();
    const row = await waitForOutboxEmail(emailB, 'verification code');
    const code = extractSixDigitCode(row.subject);

    const res = await verifyInvestorEmail(page, emailB, code);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.emailUpdated).toBe(true);

    // DB reflects the new email
    const dbInvestor = await getInvestorByEmail(emailB);
    expect(dbInvestor).not.toBeNull();
    expect(dbInvestor!.id).toBe(investor.id);
  });

  test('wrong otp is rejected', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('wrongotp');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    // Issue a real OTP so the throttle state is clean, then use a wrong code
    const startRes = await startInvestorEmailOtp(page, email);
    expect(startRes.ok()).toBeTruthy();

    const res = await verifyInvestorEmail(page, email, '000000');
    expect(res.status()).toBe(400);
  });

  test('expired otp is rejected', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('expired');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    const code = await startAndReadInvestorEmailOtp(page, email);
    await expireOtpForEmail(email);

    const res = await verifyInvestorEmail(page, email, code);
    expect(res.status()).toBe(400);
  });

  test('otp start endpoint enforces rate limit', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('startlimit');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    // MAX_ISSUANCES_PER_WINDOW = 3 — first three succeed
    for (let i = 0; i < 3; i++) {
      const r = await startInvestorEmailOtp(page, email);
      expect(r.ok()).toBeTruthy();
    }
    // Fourth triggers too_many_otps → 429
    const res = await startInvestorEmailOtp(page, email);
    expect(res.status()).toBe(429);
  });

  test('otp verify endpoint enforces rate limit', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('verifylimit');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    const startRes = await startInvestorEmailOtp(page, email);
    expect(startRes.ok()).toBeTruthy();

    // MAX_FAILED_ATTEMPTS = 5 — fifth failure sets locked_until
    for (let i = 0; i < 5; i++) {
      const r = await verifyInvestorEmail(page, email, '000000');
      expect(r.status()).toBe(400);
    }
    // Sixth attempt: isLocked → OtpThrottleError('locked') → 429
    const lockedRes = await verifyInvestorEmail(page, email, '000000');
    expect(lockedRes.status()).toBe(429);
  });

  test('verified state persists after page refresh', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('persist');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    const code = await startAndReadInvestorEmailOtp(page, email);
    const res = await verifyInvestorEmail(page, email, code);
    expect(res.ok()).toBeTruthy();

    // Navigate away and back — session cookie unchanged, DB state durable
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const dbInvestor = await getInvestorByEmail(email);
    expect(dbInvestor?.emailVerifiedAt).not.toBeNull();
  });

  test('verification writes interaction event', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('interaction');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    const code = await startAndReadInvestorEmailOtp(page, email);
    const res = await verifyInvestorEmail(page, email, code);
    expect(res.ok()).toBeTruthy();

    const event = await getLatestInteraction({ investorId: investor.id, kind: 'email_verified' });
    expect(event).not.toBeNull();
    const payload = event!.payload as Record<string, unknown>;
    expect(payload.emailUpdated).toBe(false);
    expect(payload.email).toBe(email);
  });

  test('email verification is case insensitive', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('case');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);

    // Issue OTP with lowercase (predictable outbox key), verify with uppercase
    const code = await startAndReadInvestorEmailOtp(page, email);
    const res = await verifyInvestorEmail(page, email.toUpperCase(), code);
    expect(res.ok()).toBeTruthy();
  });

  test('email collision with another investor is rejected', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const emailA = makeEmail('cola');
    const emailB = makeEmail('colb');
    // Create both investors in the same workspace
    const investorA = await createInvestor(founderApi, { email: emailA });
    await createInvestor(founderApi, { email: emailB });

    // Investor A tries to claim investor B's email
    const invite = await issueInviteLink(founderApi, investorA.id);
    await redeemInvite(page, invite.url);

    const startRes = await startInvestorEmailOtp(page, emailB);
    expect(startRes.ok()).toBeTruthy();
    const row = await waitForOutboxEmail(emailB, 'verification code');
    const code = extractSixDigitCode(row.subject);

    const res = await verifyInvestorEmail(page, emailB, code);
    expect(res.status()).toBe(409);
  });
});
