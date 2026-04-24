import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { auditEventsRepo } from '@/lib/db/repos/audit-events';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:audit:feed', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const { limit } = Query.parse(Object.fromEntries(url.searchParams));
  const feed = await auditEventsRepo.feed(user.workspaceId, limit ?? 100);
  return Response.json({ rows: feed, count: feed.length });
});
