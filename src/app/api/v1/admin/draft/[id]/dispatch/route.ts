/**
 * Send a previously-approved draft. Hard-gated: rejects unless status='approved'.
 * After SMTP success, marks status='sent' and (if leadId is bound) records the
 * email_sent interaction + auto-advances the lead stage.
 */
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leadsRepo } from '@/lib/db/repos/leads';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';
import { autoAdvanceOnEvent } from '@/lib/services/auto-transition';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:draft:dispatch', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = IdSchema.parse(segments[segments.length - 2]);

  const row = await emailOutboxRepo.byId(user.workspaceId, id);
  if (!row) throw new ApiError(404, 'draft_not_found');
  if (row.status !== 'approved') {
    throw new ApiError(409, `not_approved_status_${row.status}`);
  }

  try {
    const args: Parameters<typeof sendMail>[0] = {
      to: row.toEmail,
      subject: row.subject,
      text: row.bodyText,
    };
    if (row.bodyHtml) args.html = row.bodyHtml;
    const info = await sendMail(args);
    await emailOutboxRepo.markSent(row.id);

    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'draft.dispatched',
      targetType: 'email_outbox',
      targetId: id,
      payload: { toEmail: row.toEmail, messageId: info.messageId },
    });

    if (row.leadId) {
      await interactionsRepo
        .record({
          workspaceId: user.workspaceId,
          leadId: row.leadId,
          kind: 'email_sent',
          payload: { toEmail: row.toEmail, subject: row.subject, messageId: info.messageId },
        })
        .catch(() => {});
      await leadsRepo.touchLastContact(user.workspaceId, row.leadId).catch(() => {});
      await autoAdvanceOnEvent(user.workspaceId, row.leadId, 'email_sent');
    }

    return Response.json({ outboxId: id, messageId: info.messageId, status: 'sent' });
  } catch (err) {
    await emailOutboxRepo.markFailed(id, (err as Error).message.slice(0, 500));
    throw err;
  }
});
