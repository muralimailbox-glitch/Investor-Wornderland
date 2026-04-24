import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  toEmail: z.string().email().max(254),
  subject: z.string().min(1).max(180),
  bodyText: z.string().min(1).max(20_000),
  bodyHtml: z.string().max(60_000).optional(),
  leadId: z.string().uuid().optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:send', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const outboxInsert: Parameters<typeof emailOutboxRepo.enqueue>[0] = {
    workspaceId: user.workspaceId,
    toEmail: body.toEmail,
    subject: body.subject,
    bodyText: body.bodyText,
    status: 'queued',
  };
  if (body.bodyHtml) outboxInsert.bodyHtml = body.bodyHtml;
  const outbox = await emailOutboxRepo.enqueue(outboxInsert);

  try {
    const sendArgs: Parameters<typeof sendMail>[0] = {
      to: body.toEmail,
      subject: body.subject,
      text: body.bodyText,
    };
    if (body.bodyHtml) sendArgs.html = body.bodyHtml;
    const info = await sendMail(sendArgs);
    await emailOutboxRepo.markSent(outbox.id);
    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'draft.sent',
      targetType: 'email_outbox',
      targetId: outbox.id,
      payload: { toEmail: body.toEmail, leadId: body.leadId ?? null, messageId: info.messageId },
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
