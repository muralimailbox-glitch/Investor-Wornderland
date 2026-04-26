import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { ApiError, BadRequestError, NotFoundError } from '@/lib/api/handle';
import { issueNdaSession, issueSigningToken, readSigningToken } from '@/lib/auth/nda-session';
import { issueOtp, verifyOtp } from '@/lib/auth/otp';
import { db } from '@/lib/db/client';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { ndasRepo } from '@/lib/db/repos/ndas';
import { deals, firms, investors, leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { sealNda } from '@/lib/pdf/seal-nda';
import { getStorage } from '@/lib/storage';

const NDA_TEMPLATE_VERSION = '2026-04-v1';

async function resolveDefaultWorkspaceId(): Promise<string> {
  const rows = await db.select({ id: leads.workspaceId }).from(leads).limit(1);
  const first = rows[0];
  if (!first) {
    throw new ApiError(503, 'workspace_not_provisioned');
  }
  return first.id;
}

async function resolveDefaultDealId(workspaceId: string): Promise<string> {
  const [row] = await db.select().from(deals).where(eq(deals.workspaceId, workspaceId)).limit(1);
  if (!row) throw new ApiError(503, 'deal_not_provisioned');
  return row.id;
}

async function findOrCreatePlaceholderLead(input: {
  workspaceId: string;
  email: string;
}): Promise<{ leadId: string; investorId: string; firmId: string }> {
  const existingInvestor = await db
    .select()
    .from(investors)
    .where(and(eq(investors.workspaceId, input.workspaceId), eq(investors.email, input.email)))
    .limit(1);

  let investor = existingInvestor[0] ?? null;
  let firmId: string;

  if (!investor) {
    const placeholderFirm = await db
      .select()
      .from(firms)
      .where(
        and(eq(firms.workspaceId, input.workspaceId), eq(firms.name, 'Unknown (self-serve NDA)')),
      )
      .limit(1);

    let firm = placeholderFirm[0] ?? null;
    if (!firm) {
      const [created] = await db
        .insert(firms)
        .values({
          workspaceId: input.workspaceId,
          name: 'Unknown (self-serve NDA)',
          firmType: 'angel',
        })
        .returning();
      if (!created) throw new Error('failed to create placeholder firm');
      firm = created;
    }
    firmId = firm.id;

    const emailLocal = input.email.split('@')[0] ?? 'investor';
    const [createdInvestor] = await db
      .insert(investors)
      .values({
        workspaceId: input.workspaceId,
        firmId,
        firstName: emailLocal,
        lastName: '—',
        title: 'Unknown',
        decisionAuthority: 'unknown',
        email: input.email,
        timezone: 'Asia/Kolkata',
      })
      .returning();
    if (!createdInvestor) throw new Error('failed to create placeholder investor');
    investor = createdInvestor;
  } else {
    firmId = investor.firmId;
  }

  const dealId = await resolveDefaultDealId(input.workspaceId);
  const existingLead = await db
    .select()
    .from(leads)
    .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.investorId, investor.id)))
    .limit(1);

  let lead = existingLead[0] ?? null;
  if (!lead) {
    const [createdLead] = await db
      .insert(leads)
      .values({
        workspaceId: input.workspaceId,
        dealId,
        investorId: investor.id,
        stage: 'nda_pending',
        sourceOfLead: 'self_serve',
      })
      .returning();
    if (!createdLead) throw new Error('failed to create lead');
    lead = createdLead;
  } else if (lead.stage === 'prospect' || lead.stage === 'contacted' || lead.stage === 'engaged') {
    const [updated] = await db
      .update(leads)
      .set({ stage: 'nda_pending', stageEnteredAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, lead.id))
      .returning();
    if (updated) lead = updated;
  }

  return { leadId: lead.id, investorId: investor.id, firmId };
}

export async function initiateNda(email: string): Promise<{ sent: true }> {
  const workspaceId = await resolveDefaultWorkspaceId();
  await findOrCreatePlaceholderLead({ workspaceId, email });
  const code = await issueOtp(email);
  const otp = renderBrandedEmail({
    heading: 'Your OotaOS NDA verification code',
    body: `Enter this code on the NDA signing page to continue. It expires in 10 minutes.\n\nYour code: ${code}`,
    facts: [
      ['Code', code],
      ['Valid for', '10 minutes'],
    ],
    preFooter:
      'If you did not request this, you can safely ignore this email — the code expires automatically.',
  });
  await sendMail({
    to: email,
    subject: `Your OotaOS NDA verification code: ${code}`,
    text: otp.text,
    html: otp.html,
  });
  await emailOutboxRepo.enqueue({
    workspaceId,
    toEmail: email,
    subject: `Your OotaOS NDA verification code: ${code}`,
    bodyText: `OTP issued ${new Date().toISOString()}`,
    status: 'sent',
    sentAt: new Date(),
  });
  return { sent: true };
}

export async function verifyNdaOtp(
  email: string,
  code: string,
): Promise<{ token: string; expiresAt: string }> {
  const workspaceId = await resolveDefaultWorkspaceId();
  const ok = await verifyOtp(email, code);
  if (!ok) throw new BadRequestError('invalid_or_expired_otp');
  const { leadId } = await findOrCreatePlaceholderLead({ workspaceId, email });
  const { token, expiresAt } = issueSigningToken({ email, leadId });
  return { token, expiresAt: expiresAt.toISOString() };
}

export type NdaSignInput = {
  token: string;
  name: string;
  title: string;
  firm: string;
  signerIp: string;
  signerUserAgent: string;
};

export type NdaSignResult = {
  ndaId: string;
  leadId: string;
  downloadUrl: string;
  sessionCookieValue: string;
  sessionMaxAgeSeconds: number;
};

export async function signNda(input: NdaSignInput): Promise<NdaSignResult> {
  const decoded = readSigningToken(input.token);
  if (!decoded) throw new BadRequestError('invalid_or_expired_token');

  const workspaceId = await resolveDefaultWorkspaceId();
  const lead = await db.select().from(leads).where(eq(leads.id, decoded.leadId)).limit(1);
  if (!lead[0]) throw new NotFoundError('lead_not_found');

  const signedAt = new Date();
  const otpVerifiedAt = new Date(decoded.issuedAt);

  const pdfBytes = await sealNda({
    signer: {
      name: input.name,
      title: input.title,
      firm: input.firm,
      email: decoded.email,
    },
    signedAt,
    signerIp: input.signerIp,
    signerUserAgent: input.signerUserAgent,
    templateVersion: NDA_TEMPLATE_VERSION,
    otpVerifiedAt,
  });

  const sha256 = createHash('sha256').update(pdfBytes).digest('hex');
  const r2Key = `ndas/${workspaceId}/${decoded.leadId}/${signedAt.getTime()}.pdf`;
  const storage = getStorage();
  await storage.put(r2Key, Buffer.from(pdfBytes), 'application/pdf');

  const nda = await ndasRepo.create({
    workspaceId,
    leadId: decoded.leadId,
    templateVersion: NDA_TEMPLATE_VERSION,
    signedPdfR2Key: r2Key,
    signedPdfSha256: sha256,
    signerName: input.name,
    signerTitle: input.title,
    signerFirm: input.firm,
    signerEmail: decoded.email,
    signerIp: input.signerIp,
    signerUserAgent: input.signerUserAgent,
    otpVerifiedAt,
    signedAt,
  });

  // Auto-advance to nda_signed via the central helper so activity log + audit
  // trail stay consistent with other stage advancements.
  const { autoAdvanceOnEvent } = await import('@/lib/services/auto-transition');
  await autoAdvanceOnEvent(workspaceId, decoded.leadId, 'nda_signed');

  // Per the in-app NDA flow: investor reads + signs on screen, no PDF is
  // emailed. The sealed PDF is still kept in storage for audit. The
  // investor's confirmation lives in the in-app "Signed. Taking you in."
  // success screen and the audit log entry below.
  const session = issueNdaSession({ leadId: decoded.leadId, ndaId: nda.id, email: decoded.email });

  // Founder notification stays — operator wants to know an NDA was signed.
  try {
    const founderEmail = renderBrandedEmail({
      heading: `NDA signed — ${input.name}`,
      body: `${input.name} from ${input.firm} just signed the NDA. Sealed PDF is in storage and surfaced from the cockpit Diligence Room for audit.`,
      facts: [
        ['Name', input.name],
        ['Title', input.title],
        ['Firm', input.firm],
        ['Email', decoded.email],
        ['Signed at', signedAt.toISOString()],
        ['Sealed PDF', r2Key],
      ],
      cta: [
        {
          label: 'Open Diligence Room',
          href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/diligence`,
        },
      ],
    });
    await sendMail({
      to: env.SMTP_FROM,
      subject: `NDA signed — ${input.name} (${input.firm})`,
      text: founderEmail.text,
      html: founderEmail.html,
    });
  } catch (err) {
    console.warn('[nda] founder notification failed', err);
  }
  const downloadUrl = '';

  return {
    ndaId: nda.id,
    leadId: decoded.leadId,
    downloadUrl,
    sessionCookieValue: session.cookieValue,
    sessionMaxAgeSeconds: session.maxAgeSeconds,
  };
}
