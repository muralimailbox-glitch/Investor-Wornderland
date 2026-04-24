import { desc, eq } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { deals } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:deals:current', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const rows = await db
    .select()
    .from(deals)
    .where(eq(deals.workspaceId, user.workspaceId))
    .orderBy(desc(deals.createdAt))
    .limit(1);
  return Response.json(rows[0] ?? null);
});
