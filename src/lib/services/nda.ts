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
  await sendMail({
    to: email,
    subject: `Your OotaOS NDA verification code: ${code}`,
    text: [
      `Your OotaOS NDA verification code is: ${code}`,
      '',
      'This code expires in 10 minutes.',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— OotaOS',
    ].join('\n'),
    html: ndaOtpHtml(code),
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

  await db
    .update(leads)
    .set({ stage: 'nda_signed', stageEnteredAt: signedAt, updatedAt: signedAt })
    .where(eq(leads.id, decoded.leadId));

  const downloadUrl = await storage.url(r2Key, 900);

  const session = issueNdaSession({ leadId: decoded.leadId, ndaId: nda.id, email: decoded.email });

  try {
    await sendMail({
      to: decoded.email,
      subject: 'Your countersigned OotaOS NDA',
      text: [
        `Hi ${input.name},`,
        '',
        'Thanks for signing the OotaOS mutual NDA.',
        'Your sealed copy is attached (and available at the link below for the next 15 minutes).',
        '',
        downloadUrl,
        '',
        'Signed at: ' + signedAt.toISOString(),
        '',
        '— OotaOS',
      ].join('\n'),
      html: ndaConfirmationHtml(input.name, downloadUrl, signedAt),
    });
  } catch (err) {
    console.warn('[nda] confirmation email failed', err);
  }

  try {
    await sendMail({
      to: env.SMTP_FROM,
      subject: `NDA signed — ${input.name} (${input.firm})`,
      text: [
        `A new NDA has been signed.`,
        ``,
        `Name: ${input.name}`,
        `Title: ${input.title}`,
        `Firm: ${input.firm}`,
        `Email: ${decoded.email}`,
        `IP: ${input.signerIp}`,
        `Signed at: ${signedAt.toISOString()}`,
        `PDF: ${downloadUrl}`,
      ].join('\n'),
    });
  } catch (err) {
    console.warn('[nda] founder notification failed', err);
  }

  return {
    ndaId: nda.id,
    leadId: decoded.leadId,
    downloadUrl,
    sessionCookieValue: session.cookieValue,
    sessionMaxAgeSeconds: session.maxAgeSeconds,
  };
}

function ndaOtpHtml(code: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Inter, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111">
  <h1 style="font-size: 18px; letter-spacing: -0.01em; margin: 0 0 16px">Your OotaOS NDA verification code</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #333">Enter this code on the NDA signing page to continue. It expires in 10 minutes.</p>
  <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.2em; background: linear-gradient(135deg,#ff7a00,#ff3d71); -webkit-background-clip: text; color: transparent; margin: 24px 0">${code}</p>
  <p style="font-size: 12px; color: #666">If you did not request this, you can safely ignore this email.</p>
</body></html>`;
}

function ndaConfirmationHtml(name: string, url: string, signedAt: Date): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, Inter, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #111">
  <h1 style="font-size: 20px; letter-spacing: -0.01em; margin: 0 0 16px">Hi ${name} — your NDA is sealed</h1>
  <p style="font-size: 14px; line-height: 1.6; color: #333">A sealed copy is attached to this email and available at the link below for the next 15 minutes.</p>
  <p><a href="${url}" style="display: inline-block; padding: 10px 18px; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-size: 14px">Download signed NDA</a></p>
  <p style="font-size: 12px; color: #666">Signed at ${signedAt.toISOString()}.</p>
  <p style="font-size: 12px; color: #666">— OotaOS</p>
</body></html>`;
}
