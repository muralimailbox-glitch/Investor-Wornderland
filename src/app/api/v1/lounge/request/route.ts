import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { documentsRepo } from '@/lib/db/repos/documents';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
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
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
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

  const body = [
    `An investor in the lounge has submitted a request.`,
    ``,
    `Investor: ${session.email}`,
    `Lead ID: ${lead.id}`,
    `Type: ${input.kind === 'original_document' ? 'Original document' : 'More information'}`,
    docFilename ? `Document: ${docFilename}` : null,
    input.message ? `Message:\n${input.message}` : '(no message provided)',
    ``,
    `Open the cockpit to respond:`,
    `${env.NEXT_PUBLIC_SITE_URL}/cockpit/investors`,
  ]
    .filter((s): s is string => Boolean(s))
    .join('\n');

  // Notify the founder
  try {
    await sendMail({ to: env.SMTP_FROM, subject, text: body });
  } catch (err) {
    console.warn('[lounge:request] founder email failed', err);
  }

  // Acknowledge the investor
  try {
    await sendMail({
      to: session.email,
      subject: 'We received your request',
      text:
        input.kind === 'original_document'
          ? `Thanks for the request${docFilename ? ` on ${docFilename}` : ''}. The founders will respond within 24 hours from info@ootaos.com.\n\nIf you'd rather speak directly, you can book a 30-minute call any time at ${env.NEXT_PUBLIC_SITE_URL}/lounge.`
          : `Thanks for reaching out. The founders will respond within 24 hours from info@ootaos.com.\n\nIf you'd rather speak directly, you can book a 30-minute call any time at ${env.NEXT_PUBLIC_SITE_URL}/lounge.`,
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
  await audit({
    workspaceId: lead.workspaceId,
    actorUserId: lead.id,
    action: 'lounge.request',
    targetType: 'lead',
    targetId: lead.id,
    payload: {
      kind: input.kind,
      documentId: input.documentId ?? null,
      filename: docFilename,
    },
  });

  return Response.json({ ok: true });
});
