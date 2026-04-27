import { getInvestorByEmail, getLatestAuditEvent } from './helpers/db';
import { expect, test } from './helpers/fixtures';
import {
  bulkImportInvestors,
  createInvestor,
  importInvestorsCsv,
  issueInviteLink,
  revokeInviteLinks,
} from './helpers/founder';
import {
  clearInvestorSession,
  expectInvestorAuthenticated,
  probeInvestorDataAccess,
  redeemInvite,
} from './helpers/investor';
import { countOutboxEmails } from './helpers/mail';

test.describe('Investor Invite', () => {
  test('founder can create investor and issue invite link', async ({ founderApi, makeEmail }) => {
    const email = makeEmail('invite');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    expect(invite.url).toContain('/i/');
    expect(invite.investorEmail).toBe(email);
    expect(invite.expiresAt).toBeTruthy();
  });

  test('issued invite link redeems into investor cookie session', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('invite');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, invite.url);
    const ctx = await expectInvestorAuthenticated(page);
    expect(ctx.investorId).toBe(investor.id);
  });

  test('founder can send invite email from investor detail screen', async ({
    founderApi,
    makeEmail,
  }) => {
    const email = makeEmail('invite');
    const investor = await createInvestor(founderApi, { email });
    // sendEmail: true — SMTP errors are caught silently; route still returns the URL
    const invite = await issueInviteLink(founderApi, investor.id, { sendEmail: true });
    expect(invite.url).toContain('/i/');
    // Audit confirms sendEmail flag was recorded
    const audit = await getLatestAuditEvent('invite_link.issue', investor.id);
    expect(audit).not.toBeNull();
    expect((audit!.payload as Record<string, unknown>).sendEmail).toBe(true);
  });

  test('manual copied invite link works same as emailed link', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('invite');
    const investor = await createInvestor(founderApi, { email });
    // No email — simulates the founder copying the URL from the cockpit
    const invite = await issueInviteLink(founderApi, investor.id, { sendEmail: false });
    // Issuing with sendEmail:false must not queue any outbox row for this recipient
    expect(await countOutboxEmails(email)).toBe(0);
    await redeemInvite(page, invite.url);
    const ctx = await expectInvestorAuthenticated(page);
    expect(ctx.investorId).toBe(investor.id);
  });

  test('latest issued invite remains usable for same investor', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('invite');
    const investor = await createInvestor(founderApi, { email });
    // Issue a first link (kept but not used)
    await issueInviteLink(founderApi, investor.id);
    // Issue a second link — must still work
    const second = await issueInviteLink(founderApi, investor.id);
    await redeemInvite(page, second.url);
    await expectInvestorAuthenticated(page);
  });

  test('revoked invite link is rejected', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('revoke');
    const investor = await createInvestor(founderApi, { email });
    const invite = await issueInviteLink(founderApi, investor.id);

    // Confirm the link grants data access before revocation
    await redeemInvite(page, invite.url);
    expect(await probeInvestorDataAccess(page)).toBe(true);

    // Revoke all links for this investor
    const revoke = await revokeInviteLinks(founderApi, investor.id);
    expect(revoke.ok).toBe(true);

    // Clear session, re-visit the old link.
    // /i/[token] is stateless — it will set the cookie again.
    // But getInvestorContext() checks the DB revocation table and rejects it.
    await clearInvestorSession(page);
    await redeemInvite(page, invite.url);
    expect(await probeInvestorDataAccess(page)).toBe(false);
  });

  test('reissued invite after revocation works', async ({ founderApi, page, makeEmail }) => {
    const email = makeEmail('reissue');
    const investor = await createInvestor(founderApi, { email });
    const firstInvite = await issueInviteLink(founderApi, investor.id);

    await revokeInviteLinks(founderApi, investor.id);

    // New link issued after revokedBefore timestamp — issuedAt > revokedBefore
    const secondInvite = await issueInviteLink(founderApi, investor.id);
    expect(secondInvite.url).not.toBe(firstInvite.url);

    await redeemInvite(page, secondInvite.url);
    await expectInvestorAuthenticated(page);
  });

  test('csv imported investor can receive and redeem invite', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('csvimport');
    const csv = [
      'firm_name,firm_type,first_name,last_name,title,decision_authority,email,timezone',
      `CSV Capital,vc,Csv,Investor,Partner,full,${email},Asia/Kolkata`,
    ].join('\n');
    const result = await importInvestorsCsv(founderApi, csv);
    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);

    const dbInvestor = await getInvestorByEmail(email);
    expect(dbInvestor).not.toBeNull();

    const invite = await issueInviteLink(founderApi, dbInvestor!.id);
    await redeemInvite(page, invite.url);
    await expectInvestorAuthenticated(page);
  });

  test('tracxn imported investor can receive and redeem invite', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    const email = makeEmail('tracxn');
    const result = await bulkImportInvestors(founderApi, [
      {
        firmName: 'Tracxn Capital',
        firstName: 'Tracxn',
        lastName: 'Investor',
        title: 'Partner',
        decisionAuthority: 'full',
        email,
        timezone: 'Asia/Kolkata',
      },
    ]);
    expect(result.investorsCreated).toBe(1);

    const dbInvestor = await getInvestorByEmail(email);
    expect(dbInvestor).not.toBeNull();

    const invite = await issueInviteLink(founderApi, dbInvestor!.id);
    await redeemInvite(page, invite.url);
    await expectInvestorAuthenticated(page);
  });

  test('two investors from same firm get distinct correct invite identities', async ({
    founderApi,
    page,
    makeEmail,
  }) => {
    // This test has more setup steps than others — give it extra headroom.
    test.setTimeout(60_000);

    const firmName = `Shared Firm ${Date.now()}`;
    const emailA = makeEmail('firmA');
    const emailB = makeEmail('firmB');

    // Create investor A first (establishes the firm), then B in parallel with invite issuance.
    const investorA = await createInvestor(founderApi, {
      email: emailA,
      firmName,
      firstName: 'Alice',
      lastName: 'Alpha',
    });
    // B must share A's firm, so it depends on investorA.firmId — issue A's invite in parallel.
    const [investorB, inviteA] = await Promise.all([
      createInvestor(founderApi, {
        email: emailB,
        firmId: investorA.firmId,
        firstName: 'Bob',
        lastName: 'Beta',
      }),
      issueInviteLink(founderApi, investorA.id),
    ]);
    const inviteB = await issueInviteLink(founderApi, investorB.id);

    // Verify investor A's identity
    await redeemInvite(page, inviteA.url);
    const ctxA = await expectInvestorAuthenticated(page);
    expect(ctxA.investorId).toBe(investorA.id);
    expect(ctxA.firstName).toBe('Alice');

    // Switch to investor B — clear session first
    await clearInvestorSession(page);
    await redeemInvite(page, inviteB.url);
    const ctxB = await expectInvestorAuthenticated(page);
    expect(ctxB.investorId).toBe(investorB.id);
    expect(ctxB.firstName).toBe('Bob');
  });
});
