/**
 * Lightweight unread-count endpoint for the cockpit alert badge. Polled
 * by the dashboard / shell at low frequency so the founder sees a red dot
 * when new investor feedback or document requests land.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { documentFeedback } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const { user } = await requireAuth({ role: 'founder' });
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentFeedback)
    .where(
      and(
        eq(documentFeedback.workspaceId, user.workspaceId),
        isNull(documentFeedback.acknowledgedAt),
      ),
    );
  return Response.json({ count: row?.count ?? 0 });
});
