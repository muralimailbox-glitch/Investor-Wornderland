import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { getAiSpendSummary } from '@/lib/services/ai-spend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  windowDays: z.coerce.number().int().positive().max(365).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:ai-spend', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const { windowDays } = Query.parse(Object.fromEntries(url.searchParams));
  const summary = await getAiSpendSummary(user.workspaceId, windowDays ?? 30);
  return Response.json(summary);
});
