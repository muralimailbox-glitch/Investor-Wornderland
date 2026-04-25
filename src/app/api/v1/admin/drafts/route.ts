/**
 * List drafts for the Communications screen.
 *
 *   GET /api/v1/admin/drafts?status=draft   → drafts pending approval
 *   GET /api/v1/admin/drafts?status=approved
 *   GET /api/v1/admin/drafts?status=sent
 *   GET /api/v1/admin/drafts                → defaults to draft
 */
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { emailOutboxRepo, type EmailOutboxStatus } from '@/lib/db/repos/email-outbox';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StatusSchema = z
  .enum(['draft', 'approved', 'queued', 'sent', 'bounced', 'failed'])
  .default('draft');

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:drafts:list', perMinute: 120 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const status = StatusSchema.parse(url.searchParams.get('status') ?? 'draft');

  const rows = await emailOutboxRepo.listByStatus(user.workspaceId, [status as EmailOutboxStatus]);
  return Response.json({
    status,
    drafts: rows.map((r) => ({
      id: r.id,
      toEmail: r.toEmail,
      subject: r.subject,
      bodyText: r.bodyText.slice(0, 500),
      status: r.status,
      approvedBy: r.approvedBy,
      approvedAt: r.approvedAt,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
      leadId: r.leadId,
    })),
  });
});
