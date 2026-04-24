import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { transitionStage } from '@/lib/services/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  leadId: z.string().uuid(),
  nextStage: z.enum([
    'prospect',
    'contacted',
    'engaged',
    'nda_pending',
    'nda_signed',
    'meeting_scheduled',
    'diligence',
    'term_sheet',
    'funded',
    'closed_lost',
  ]),
  reason: z.string().max(500).optional(),
  force: z.boolean().optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:pipeline:transition', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());
  const params: Parameters<typeof transitionStage>[0] = {
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    leadId: body.leadId,
    nextStage: body.nextStage,
  };
  if (body.reason !== undefined) params.reason = body.reason;
  if (body.force !== undefined) params.force = body.force;
  const updated = await transitionStage(params);
  return Response.json(updated);
});
