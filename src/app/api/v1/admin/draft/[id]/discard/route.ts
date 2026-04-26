/**
 * Discard a draft. Marks status='failed' with reason='discarded_by_founder'.
 * Kept (not deleted) so the audit trail survives.
 */
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:draft:discard', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = IdSchema.parse(segments[segments.length - 2]);

  const row = await emailOutboxRepo.byId(user.workspaceId, id);
  if (!row) throw new ApiError(404, 'draft_not_found');
  if (row.status === 'sent') throw new ApiError(409, 'already_sent');

  await emailOutboxRepo.markFailed(id, 'discarded_by_founder');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.discarded',
    targetType: 'email_outbox',
    targetId: id,
    payload: { toEmail: row.toEmail, subject: row.subject },
  });

  return Response.json({ ok: true });
});
