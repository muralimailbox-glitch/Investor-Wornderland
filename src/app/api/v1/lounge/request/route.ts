import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { getActiveNdaSession } from '@/lib/auth/nda-active';
import { db } from '@/lib/db/client';
import { documentsRepo } from '@/lib/db/repos/documents';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  kind: z.enum(['original_document', 'more_info']),
  documentId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'lounge:request', perMinute: 6 });
  const input = Body.parse(await req.json());

  const cookieStore = await cookies();
  const session = await getActiveNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const leadRow = await db
    .select({ id: leads.id, workspaceId: leads.workspaceId })
    .from(leads)
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const lead = leadRow[0];
  if (!lead) throw new ApiError(404, 'lead_not_found');

  let docFilename: string | null = null;
  if (input.documentId) {
    const doc = await documentsRepo.byId(lead.workspaceId, input.documentId);
    if (!doc) throw new ApiError(404, 'document_not_found');
    docFilename = doc.originalFilename;
  }

  const subject =
    input.kind === 'original_document'
      ? `Investor request: original ${docFilename ?? 'document'} from ${session.email}`
      : `Investor request: more info from ${session.email}`;

  // Notify the founder (branded)
  try {
    const founderFacts: Array<[string, string]> = [
      ['Investor', session.email],
      ['Lead ID', lead.id],
      ['Type', input.kind === 'original_document' ? 'Original document' : 'More information'],
    ];
    if (docFilename) founderFacts.push(['Document', docFilename]);
    const founderEmail = renderBrandedEmail({
      heading: 'New investor request from the lounge',
      body:
        (input.message
          ? `${session.email} sent a message:\n\n"${input.message}"`
          : `${session.email} pinged from the lounge — no message attached.`) +
        '\n\nOpen the cockpit to draft a response.',
      facts: founderFacts,
      cta: [
        {
          label: 'Open in cockpit',
          href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/firms-contacts`,
        },
      ],
    });
    await sendMail({
      to: env.SMTP_FROM,
      subject,
      text: founderEmail.text,
      html: founderEmail.html,
    });
  } catch (err) {
    console.warn('[lounge:request] founder email failed', err);
  }

  // Acknowledge the investor (branded)
  try {
    const ackBody =
      input.kind === 'original_document'
        ? `Thanks for the request${docFilename ? ` on ${docFilename}` : ''}. The founders will respond within 24 hours from info@ootaos.com.\n\nIf you'd rather speak directly, book a 30-minute call any time from the lounge.`
        : `Thanks for reaching out. The founders will respond within 24 hours from info@ootaos.com.\n\nIf you'd rather speak directly, book a 30-minute call any time from the lounge.`;
    const investorEmail = renderBrandedEmail({
      heading: 'We received your request',
      body: ackBody,
      cta: [
        { label: 'Open the lounge', href: `${env.NEXT_PUBLIC_SITE_URL}/lounge` },
        {
          label: 'Pick a meeting time',
          href: `${env.NEXT_PUBLIC_SITE_URL}/lounge#calendar`,
        },
      ],
      preFooter: 'You can reply to this email any time — it lands directly with the founders.',
    });
    await sendMail({
      to: session.email,
      subject: 'We received your request',
      text: investorEmail.text,
      html: investorEmail.html,
    });
  } catch (err) {
    console.warn('[lounge:request] investor ack email failed', err);
  }

  // Audit + interaction trail
  await interactionsRepo.record({
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    kind: 'note',
    payload: {
      requestKind: input.kind,
      documentId: input.documentId ?? null,
      filename: docFilename,
      message: input.message ?? null,
      from: session.email,
    },
  });
  // actorUserId=null because the actor here is the investor (no users row),
  // not a founder. lead.id was previously sent which violated the FK to users.id.
  await audit({
    workspaceId: lead.workspaceId,
    actorUserId: null,
    action: 'lounge.request',
    targetType: 'lead',
    targetId: lead.id,
    payload: {
      kind: input.kind,
      documentId: input.documentId ?? null,
      filename: docFilename,
      from: session.email,
    },
  });

  return Response.json({ ok: true });
});
