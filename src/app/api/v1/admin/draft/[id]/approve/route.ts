/**
 * Approve a draft email so the SMTP pump (or a manual send) can ship it.
 * Rule #11 of the fundraising-OS: every external send needs human approval.
 *
 * draft → approved (this endpoint) → sent (pump or send route).
 *
 * Idempotent — calling on an already-approved or sent row returns 409 with
 * the current status so the cockpit can show "already approved by X at Y".
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
  await rateLimit(req, { key: 'admin:draft:approve', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // /api/v1/admin/draft/:id/approve — :id is second-to-last segment
  const id = IdSchema.parse(segments[segments.length - 2]);

  const existing = await emailOutboxRepo.byId(user.workspaceId, id);
  if (!existing) throw new ApiError(404, 'draft_not_found');
  if (existing.status !== 'draft') {
    throw new ApiError(409, `not_draft_status_${existing.status}`);
  }

  const approved = await emailOutboxRepo.approve(user.workspaceId, id, user.id);
  if (!approved) throw new ApiError(409, 'approve_failed');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.approved',
    targetType: 'email_outbox',
    targetId: id,
    payload: { toEmail: existing.toEmail, subject: existing.subject },
  });

  return Response.json({
    outboxId: id,
    status: approved.status,
    approvedBy: approved.approvedBy,
    approvedAt: approved.approvedAt,
  });
});
