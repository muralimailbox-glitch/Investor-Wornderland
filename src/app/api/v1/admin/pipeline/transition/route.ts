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
  // Stage-rule fields. Pipeline service guards require these on specific
  // transitions (closed_lost reason, funded amount/date, next-action) — we
  // pass them through so Zod doesn't strip them and the guards can fire.
  nextActionOwner: z.string().max(120).optional(),
  nextActionDue: z.string().datetime().optional(),
  closedLostReason: z.string().max(500).optional(),
  fundedAmountUsd: z.number().int().positive().optional(),
  fundedAt: z.string().datetime().optional(),
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
  if (body.nextActionOwner !== undefined) params.nextActionOwner = body.nextActionOwner;
  if (body.nextActionDue !== undefined) params.nextActionDue = new Date(body.nextActionDue);
  if (body.closedLostReason !== undefined) params.closedLostReason = body.closedLostReason;
  if (body.fundedAmountUsd !== undefined) params.fundedAmountUsd = body.fundedAmountUsd;
  if (body.fundedAt !== undefined) params.fundedAt = new Date(body.fundedAt);
  const updated = await transitionStage(params);
  return Response.json(updated);
});
