import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { investors, leads, users } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail/smtp';
import { renderByKey, TEMPLATE_KEYS } from '@/lib/mail/templates';
import { rateLimit } from '@/lib/security/rate-limit';

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
