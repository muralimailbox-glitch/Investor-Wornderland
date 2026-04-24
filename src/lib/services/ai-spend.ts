import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { aiLogs, workspaces } from '@/lib/db/schema';

export type AiSpendSummary = {
  windowDays: number;
  totalUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  capUsd: number;
  utilizationPct: number;
  byAgent: Array<{
    agent: string;
    calls: number;
    usd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  byModel: Array<{
    model: string;
    calls: number;
    usd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  daily: Array<{ day: string; calls: number; usd: number }>;
};

export async function getAiSpendSummary(
  workspaceId: string,
  windowDays = 30,
): Promise<AiSpendSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totals, byAgent, byModel, daily, workspace] = await Promise.all([
    db
      .select({
        calls: sql<number>`count(*)::int`,
        totalMicroUsd: sql<number>`coalesce(sum(${aiLogs.usdCost}), 0)::bigint`,
        inputTokens: sql<number>`coalesce(sum(${aiLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiLogs.outputTokens}), 0)::bigint`,
      })
      .from(aiLogs)
      .where(and(eq(aiLogs.workspaceId, workspaceId), gte(aiLogs.createdAt, since))),
    db
      .select({
        agent: aiLogs.agent,
        calls: sql<number>`count(*)::int`,
        totalMicroUsd: sql<number>`coalesce(sum(${aiLogs.usdCost}), 0)::bigint`,
        inputTokens: sql<number>`coalesce(sum(${aiLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiLogs.outputTokens}), 0)::bigint`,
      })
      .from(aiLogs)
      .where(and(eq(aiLogs.workspaceId, workspaceId), gte(aiLogs.createdAt, since)))
      .groupBy(aiLogs.agent),
    db
      .select({
        model: aiLogs.model,
        calls: sql<number>`count(*)::int`,
        totalMicroUsd: sql<number>`coalesce(sum(${aiLogs.usdCost}), 0)::bigint`,
        inputTokens: sql<number>`coalesce(sum(${aiLogs.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiLogs.outputTokens}), 0)::bigint`,
      })
      .from(aiLogs)
      .where(and(eq(aiLogs.workspaceId, workspaceId), gte(aiLogs.createdAt, since)))
      .groupBy(aiLogs.model),
    db.execute<{ day: string; calls: number; total_micro: number }>(sql`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        count(*)::int AS calls,
        coalesce(sum(usd_cost), 0)::bigint AS total_micro
      FROM ai_logs
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${since.toISOString()}
      GROUP BY 1
      ORDER BY 1
    `),
    db
      .select({ capUsd: workspaces.aiMonthlyCapUsd })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
  ]);

  const totalMicroUsd = Number(totals[0]?.totalMicroUsd ?? 0);
  const totalUsd = totalMicroUsd / 1_000_000;
  const capUsd = Number(workspace[0]?.capUsd ?? 50);
  const utilizationPct = capUsd > 0 ? Math.min(200, (totalUsd / capUsd) * 100) : 0;

  return {
    windowDays,
    totalUsd,
    totalInputTokens: Number(totals[0]?.inputTokens ?? 0),
    totalOutputTokens: Number(totals[0]?.outputTokens ?? 0),
    callCount: Number(totals[0]?.calls ?? 0),
    capUsd,
    utilizationPct,
    byAgent: byAgent.map((r) => ({
      agent: r.agent,
      calls: Number(r.calls),
      usd: Number(r.totalMicroUsd) / 1_000_000,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
    })),
    byModel: byModel.map((r) => ({
      model: r.model,
      calls: Number(r.calls),
      usd: Number(r.totalMicroUsd) / 1_000_000,
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
    })),
    daily: daily.map((r) => ({
      day: r.day,
      calls: Number(r.calls),
      usd: Number(r.total_micro) / 1_000_000,
    })),
  };
}
