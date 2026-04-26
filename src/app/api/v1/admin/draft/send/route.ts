import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leadsRepo } from '@/lib/db/repos/leads';
import { investors, leads, users } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail/smtp';
import { renderByKey, TEMPLATE_KEYS } from '@/lib/mail/templates';
import { rateLimit } from '@/lib/security/rate-limit';
import { autoAdvanceOnEvent } from '@/lib/services/auto-transition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  toEmail: z.string().email().max(254),
  subject: z.string().min(1).max(180),
  bodyText: z.string().min(1).max(20_000),
  bodyHtml: z.string().max(60_000).optional(),
  leadId: z.string().uuid().optional(),
  templateKey: z.enum(TEMPLATE_KEYS as unknown as [string, ...string[]]).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:send', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  // Rule #3: no outreach without a lead. If the recipient maps to a known
  // investor in this workspace, require an active lead. If the recipient is
  // a freeform email (no matching investor row), allow — that path is for
  // ad-hoc replies / non-investor emails.
  if (body.leadId) {
    const lead = await db
      .select({ id: leads.id, stage: leads.stage })
      .from(leads)
      .where(and(eq(leads.id, body.leadId), eq(leads.workspaceId, user.workspaceId)))
      .limit(1);
    if (!lead[0]) throw new ApiError(404, 'lead_not_found');
    if (lead[0].stage === 'funded' || lead[0].stage === 'closed_lost') {
      throw new ApiError(409, 'lead_terminal');
    }
  } else {
    const matched = await db
      .select({ id: investors.id })
      .from(investors)
      .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.email, body.toEmail)))
      .limit(1);
    if (matched[0]) {
      throw new ApiError(409, 'lead_required');
    }
  }

  let subject = body.subject;
  let text = body.bodyText;
  let html: string | undefined = body.bodyHtml;

  if (body.templateKey) {
    const founderRow = await db
      .select({
        displayName: users.displayName,
        email: users.email,
        publicEmail: users.publicEmail,
        whatsappE164: users.whatsappE164,
        signatureMarkdown: users.signatureMarkdown,
        companyName: users.companyName,
        companyWebsite: users.companyWebsite,
        companyAddress: users.companyAddress,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    let firstName: string | null = null;
    let lastName: string | null = null;
    if (body.leadId) {
      const leadRow = await db
        .select({ firstName: investors.firstName, lastName: investors.lastName })
        .from(leads)
        .innerJoin(investors, eq(investors.id, leads.investorId))
        .where(and(eq(leads.id, body.leadId), eq(leads.workspaceId, user.workspaceId)))
        .limit(1);
      firstName = leadRow[0]?.firstName ?? null;
      lastName = leadRow[0]?.lastName ?? null;
    }

    const rendered = renderByKey(body.templateKey as (typeof TEMPLATE_KEYS)[number], {
      firstName,
      lastName,
      founder: founderRow[0] ?? {},
      companyName: founderRow[0]?.companyName ?? null,
      physicalAddress: founderRow[0]?.companyAddress ?? null,
      extras: { subject, heading: '', body: body.bodyText },
    });
    subject = rendered.subject;
    text = rendered.text;
    html = rendered.html;
  }

  const outboxInsert: Parameters<typeof emailOutboxRepo.enqueue>[0] = {
    workspaceId: user.workspaceId,
    toEmail: body.toEmail,
    subject,
    bodyText: text,
    status: 'queued',
  };
  if (html) outboxInsert.bodyHtml = html;
  const outbox = await emailOutboxRepo.enqueue(outboxInsert);

  try {
    const sendArgs: Parameters<typeof sendMail>[0] = {
      to: body.toEmail,
      subject,
      text,
    };
    if (html) sendArgs.html = html;
    const info = await sendMail(sendArgs);
    await emailOutboxRepo.markSent(outbox.id);
    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'draft.sent',
      targetType: 'email_outbox',
      targetId: outbox.id,
      payload: {
        toEmail: body.toEmail,
        leadId: body.leadId ?? null,
        templateKey: body.templateKey ?? null,
        messageId: info.messageId,
      },
    });

    // If the email is bound to a lead, log an email_sent interaction,
    // touch lastContactAt, and let the auto-transition advance the stage.
    if (body.leadId) {
      await interactionsRepo
        .record({
          workspaceId: user.workspaceId,
          leadId: body.leadId,
          kind: 'email_sent',
          payload: { toEmail: body.toEmail, subject, messageId: info.messageId },
        })
        .catch(() => {});
      await leadsRepo.touchLastContact(user.workspaceId, body.leadId).catch(() => {});
      await autoAdvanceOnEvent(user.workspaceId, body.leadId, 'email_sent');
    }

    return Response.json({ outboxId: outbox.id, messageId: info.messageId, status: 'sent' });
  } catch (err) {
    await emailOutboxRepo.markFailed(outbox.id, (err as Error).message.slice(0, 500));
    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'draft.send_failed',
      targetType: 'email_outbox',
      targetId: outbox.id,
      payload: { toEmail: body.toEmail, error: (err as Error).message.slice(0, 500) },
    });
    throw err;
  }
});
