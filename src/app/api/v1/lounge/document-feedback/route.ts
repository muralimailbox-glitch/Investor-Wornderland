/**
 * Investor → founder feedback against the data room.
 *
 * Two flavours hitting the same endpoint:
 *   - kind=feedback     — comments on a specific document (documentId required)
 *   - kind=request_new  — investor asks for a doc we don't have yet
 *                         (requestedTitle required, documentId omitted)
 *
 * Each submission writes a `document_feedback` row, fires a notification
 * email to the founder, sends a branded acknowledgement to the investor
 * (with the standard "Regards, Krish" sign-off), and records a generic
 * `note` interaction so the lead's activity trail surfaces the event.
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { getActiveNdaSession } from '@/lib/auth/nda-active';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { documentFeedback, documents, leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { INVESTOR_SIGNOFF } from '@/lib/mail/brand';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    kind: z.enum(['feedback', 'request_new']),
    documentId: z.string().uuid().optional(),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().min(1).max(4000),
    requestedTitle: z.string().min(1).max(200).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'feedback' && !val.documentId) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentId'],
        message: 'documentId is required for feedback',
      });
    }
    if (val.kind === 'request_new' && !val.requestedTitle) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestedTitle'],
        message: 'requestedTitle is required for request_new',
      });
    }
  });

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'lounge:document-feedback', perMinute: 6 });
  const input = Body.parse(await req.json());

  const cookieStore = await cookies();
  const session = await getActiveNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  // Resolve the lead's workspace + sanity-check the document if one was
  // supplied. Cross-workspace request → 404 (deal-scoped data room rule).
  const leadRow = await db
    .select({ id: leads.id, workspaceId: leads.workspaceId })
    .from(leads)
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const lead = leadRow[0];
  if (!lead) throw new ApiError(404, 'lead_not_found');

  let docTitle: string | null = null;
  let docFilename: string | null = null;
  if (input.documentId) {
    const docRow = await db
      .select({
        id: documents.id,
        workspaceId: documents.workspaceId,
        title: documents.title,
        originalFilename: documents.originalFilename,
      })
      .from(documents)
      .where(eq(documents.id, input.documentId))
      .limit(1);
    const doc = docRow[0];
    if (!doc || doc.workspaceId !== lead.workspaceId) {
      throw new ApiError(404, 'document_not_found');
    }
    docTitle = doc.title;
    docFilename = doc.originalFilename;
  }

  // Persist the feedback row first — this is the source of truth that
  // drives the cockpit inbox and the alert badge. Email + interaction are
  // best-effort wrappers around this commit.
  const [inserted] = await db
    .insert(documentFeedback)
    .values({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      documentId: input.documentId ?? null,
      kind: input.kind,
      rating: input.rating ?? null,
      message: input.message,
      requestedTitle: input.kind === 'request_new' ? (input.requestedTitle ?? null) : null,
      submittedByEmail: session.email,
    })
    .returning();
  if (!inserted) throw new ApiError(500, 'feedback_insert_failed');

  // Founder notification — branded shell so it lands consistent with
  // every other system email. Includes a deep link to the cockpit
  // feedback inbox so the founder can triage in one click.
  try {
    const docLabel = docTitle || docFilename || 'document';
    const heading =
      input.kind === 'feedback'
        ? `Investor feedback on ${docLabel}`
        : `New document request: ${input.requestedTitle ?? 'untitled'}`;
    const body =
      input.kind === 'feedback'
        ? `${session.email} left feedback on ${docLabel}.${
            input.rating ? `\n\nRating: ${input.rating}/5` : ''
          }\n\n"${input.message}"`
        : `${session.email} requested a document we don't have yet.\n\nTitle: ${input.requestedTitle}\nReason:\n"${input.message}"`;
    const founderEmail = renderBrandedEmail({
      heading,
      body,
      cta: [{ label: 'Open feedback inbox', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/feedback` }],
    });
    await sendMail({
      to: env.SMTP_FROM,
      subject: heading,
      text: founderEmail.text,
      html: founderEmail.html,
    });
  } catch (err) {
    console.warn('[lounge:document-feedback] founder notification failed', err);
  }

  // Investor acknowledgement — same sign-off as every other investor mail.
  try {
    const ackHeading =
      input.kind === 'feedback' ? 'Thanks for the feedback' : 'We received your document request';
    const ackBody =
      input.kind === 'feedback'
        ? `Thanks for the feedback — Krish reads every note personally and will follow up if any of it warrants a direct response.`
        : `Thanks for the request. Krish will respond within 24 hours about whether the document is shareable now or needs more legal review first.`;
    const investorEmail = renderBrandedEmail({
      heading: ackHeading,
      body: ackBody,
      preFooter:
        'Reply to this email any time — it lands directly with the founder. WhatsApp +61 412 766 366 also works for time-sensitive asks.',
      signature: INVESTOR_SIGNOFF,
    });
    await sendMail({
      to: session.email,
      subject: ackHeading,
      text: investorEmail.text,
      html: investorEmail.html,
    });
  } catch (err) {
    console.warn('[lounge:document-feedback] investor ack failed', err);
  }

  // Interaction trail — the lead activity drawer in the cockpit reads
  // these to show "what happened on this lead". Stamping it as a note so
  // it threads with the existing investor-side request type.
  await interactionsRepo
    .record({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      kind: 'note',
      payload: {
        kind: 'document_feedback',
        feedbackId: inserted.id,
        feedbackKind: input.kind,
        documentId: input.documentId ?? null,
        requestedTitle: input.kind === 'request_new' ? (input.requestedTitle ?? null) : null,
        rating: input.rating ?? null,
      },
    })
    .catch(() => {});

  await audit({
    workspaceId: lead.workspaceId,
    actorUserId: null,
    action: 'lounge.document_feedback',
    targetType: 'document_feedback',
    targetId: inserted.id,
    payload: {
      kind: input.kind,
      documentId: input.documentId ?? null,
      from: session.email,
    },
  });

  return Response.json({ ok: true, feedbackId: inserted.id });
});
