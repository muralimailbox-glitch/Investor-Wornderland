import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { TEMPLATE_KEYS } from '@/lib/mail/templates';
import { rateLimit } from '@/lib/security/rate-limit';
import { createBatch, MAX_BATCH_SIZE } from '@/lib/services/batch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH_SIZE),
  subject: z.string().min(1).max(180),
  bodyText: z.string().min(1).max(12_000),
  bodyHtml: z.string().max(40_000).optional(),
  templateKey: z.enum(TEMPLATE_KEYS as unknown as [string, ...string[]]).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:batch:create', perMinute: 12 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());
  const batch = await createBatch({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    leadIds: body.leadIds,
    subject: body.subject,
    bodyText: body.bodyText,
    ...(body.bodyHtml !== undefined ? { bodyHtml: body.bodyHtml } : {}),
    ...(body.templateKey !== undefined
      ? { templateKey: body.templateKey as (typeof TEMPLATE_KEYS)[number] }
      : {}),
  });
  return Response.json(batch, { status: 201 });
});
