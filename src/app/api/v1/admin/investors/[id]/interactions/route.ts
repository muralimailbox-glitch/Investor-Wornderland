import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { interactions, investors, leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../investors/:id/interactions → id is second-to-last.
  return IdSchema.parse(segments[segments.length - 2]);
}

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:interactions', perMinute: 120 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);

  const [inv] = await db
    .select({
      id: investors.id,
      firstName: investors.firstName,
      lastName: investors.lastName,
      email: investors.email,
      emailVerifiedAt: investors.emailVerifiedAt,
      lastContactAt: investors.lastContactAt,
    })
    .from(investors)
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!inv) throw new NotFoundError('investor_not_found');

  // Activity flows in via either `investorId` directly (concierge questions,
  // email verification) or via `leadId` (email_sent, stage_change, document
  // viewed, meeting_held). Pull the investor's lead ids first so we can
  // OR over both keys and surface the complete timeline.
  const leadRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.workspaceId, user.workspaceId), eq(leads.investorId, investorId)));
  const leadIds = leadRows.map((l) => l.id);

  const rows = await db
    .select({
      id: interactions.id,
      kind: interactions.kind,
      payload: interactions.payload,
      createdAt: interactions.createdAt,
      leadId: interactions.leadId,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.workspaceId, user.workspaceId),
        leadIds.length > 0
          ? or(eq(interactions.investorId, investorId), inArray(interactions.leadId, leadIds))
          : eq(interactions.investorId, investorId),
      ),
    )
    .orderBy(desc(interactions.createdAt))
    .limit(200);

  // Roll up depth topics from question_asked rows to surface their interest
  // areas at a glance without the founder having to scroll the timeline.
  const topicCounts = new Map<string, number>();
  const refusedCount = rows.filter(
    (r) =>
      r.kind === 'question_asked' &&
      typeof r.payload === 'object' &&
      r.payload !== null &&
      (r.payload as { refused?: boolean }).refused === true,
  ).length;

  for (const r of rows) {
    if (r.kind !== 'question_asked') continue;
    const topics = (r.payload as { depthTopics?: unknown } | null)?.depthTopics;
    if (!Array.isArray(topics)) continue;
    for (const t of topics) {
      if (typeof t !== 'string') continue;
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }

  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([topic, count]) => ({ topic, count }));

  const questionsAsked = rows.filter((r) => r.kind === 'question_asked').length;
  const lastQuestionAt =
    rows.find((r) => r.kind === 'question_asked')?.createdAt?.toISOString?.() ?? null;

  return Response.json({
    investor: {
      id: inv.id,
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      emailVerifiedAt: inv.emailVerifiedAt ? inv.emailVerifiedAt.toISOString() : null,
      lastContactAt: inv.lastContactAt ? inv.lastContactAt.toISOString() : null,
    },
    summary: {
      questionsAsked,
      refusedCount,
      lastQuestionAt,
      topTopics,
    },
    interactions: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
