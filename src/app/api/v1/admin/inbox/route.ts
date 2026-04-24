import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { emailInbox } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:inbox:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const { limit } = Query.parse(Object.fromEntries(url.searchParams));

  const rows = await db
    .select()
    .from(emailInbox)
    .where(eq(emailInbox.workspaceId, user.workspaceId))
    .orderBy(desc(emailInbox.receivedAt))
    .limit(limit ?? 50);

  return Response.json({ rows, count: rows.length });
});
