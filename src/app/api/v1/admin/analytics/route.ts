/**
 * Funnel + closed_lost analytics for the cockpit dashboard.
 *
 *   GET /api/v1/admin/analytics
 *
 * Returns:
 *   - stage histogram (count per stage)
 *   - conversion ratio between adjacent stages
 *   - $ committed / funded / ask + progress %
 *   - closed_lost reason breakdown
 *   - time-in-stage averages
 *   - inbound vs outbound interaction split (last 30d)
 */
import { and, desc, eq, sql } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { deals, interactions, leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAGE_ORDER: Array<typeof leads.$inferSelect.stage> = [
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
];

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:analytics', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const workspaceId = user.workspaceId;

  // 1. Stage histogram
  const stageRows = await db
    .select({ stage: leads.stage, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId))
    .groupBy(leads.stage);

  const stageCounts = new Map<string, number>();
  for (const r of stageRows) stageCounts.set(r.stage as string, r.count);

  const stages = STAGE_ORDER.map((s) => ({
    stage: s,
    count: stageCounts.get(s) ?? 0,
  }));

  // 2. Conversion: each non-terminal stage's "carry forward" = sum of all
  // stages at-or-after-it. Conversion from N → N+1 = countN+1 / countN.
  const carryForward = new Map<string, number>();
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    let total = 0;
    for (let j = i; j < STAGE_ORDER.length; j++) {
      const s = STAGE_ORDER[j];
      if (s) total += stageCounts.get(s) ?? 0;
    }
    const stageAtI = STAGE_ORDER[i];
    if (stageAtI) carryForward.set(stageAtI, total);
  }
  const conversion = STAGE_ORDER.slice(0, -2).map((s, i) => {
    const next = STAGE_ORDER[i + 1];
    if (!next) return { from: s, to: s, ratio: 0 };
    const a = carryForward.get(s) ?? 0;
    const b = carryForward.get(next) ?? 0;
    return {
      from: s,
      to: next,
      ratio: a > 0 ? b / a : 0,
    };
  });

  // 3. $ progress
  const [activeDeal] = await db
    .select({
      ask: deals.targetSizeUsd,
      committed: deals.committedUsd,
      preMoney: deals.preMoneyUsd,
      postMoney: deals.postMoneyUsd,
    })
    .from(deals)
    .where(eq(deals.workspaceId, workspaceId))
    .orderBy(desc(deals.createdAt))
    .limit(1);

  const sumsRow = await db
    .select({
      committed: sql<number>`coalesce(sum(${leads.committedUsd}), 0)::bigint::int`,
      funded: sql<number>`coalesce(sum(${leads.fundedAmountUsd}), 0)::bigint::int`,
    })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId));
  const committedSum = sumsRow[0]?.committed ?? 0;
  const fundedSum = sumsRow[0]?.funded ?? 0;

  // 4. Closed-lost reason breakdown
  const lostRows = await db
    .select({
      reason: leads.closedLostReason,
      count: sql<number>`count(*)::int`,
    })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.stage, 'closed_lost')))
    .groupBy(leads.closedLostReason);
  const closedLost = lostRows.map((r) => ({
    reason: r.reason ?? '(no reason recorded)',
    count: r.count,
  }));

  // 5. Time-in-stage averages — uses stageEnteredAt vs now.
  const timeInStage = await db
    .select({
      stage: leads.stage,
      avgDays: sql<number>`coalesce(avg(extract(epoch from (now() - ${leads.stageEnteredAt}))) / 86400.0, 0)::float`,
    })
    .from(leads)
    .where(eq(leads.workspaceId, workspaceId))
    .groupBy(leads.stage);

  // 6. Last-30d activity split
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [activityRow] = await db
    .select({
      questions: sql<number>`count(*) filter (where ${interactions.kind} = 'question_asked')::int`,
      sent: sql<number>`count(*) filter (where ${interactions.kind} = 'email_sent')::int`,
      received: sql<number>`count(*) filter (where ${interactions.kind} = 'email_received')::int`,
      docs: sql<number>`count(*) filter (where ${interactions.kind} = 'document_viewed')::int`,
      meetings: sql<number>`count(*) filter (where ${interactions.kind} = 'meeting_held')::int`,
      notes: sql<number>`count(*) filter (where ${interactions.kind} = 'note')::int`,
    })
    .from(interactions)
    .where(
      and(
        eq(interactions.workspaceId, workspaceId),
        sql`${interactions.createdAt} >= ${since.toISOString()}`,
      ),
    );

  return Response.json({
    stages,
    conversion,
    round: {
      ask: activeDeal?.ask ?? 0,
      committed: Math.max(committedSum, activeDeal?.committed ?? 0),
      funded: fundedSum,
      preMoney: activeDeal?.preMoney ?? null,
      postMoney: activeDeal?.postMoney ?? null,
    },
    closedLost,
    timeInStage: timeInStage.map((t) => ({
      stage: t.stage,
      avgDays: Math.round(t.avgDays * 10) / 10,
    })),
    activity30d: {
      questions: activityRow?.questions ?? 0,
      emailSent: activityRow?.sent ?? 0,
      emailReceived: activityRow?.received ?? 0,
      documentsViewed: activityRow?.docs ?? 0,
      meetingsHeld: activityRow?.meetings ?? 0,
      notesLogged: activityRow?.notes ?? 0,
    },
  });
});
