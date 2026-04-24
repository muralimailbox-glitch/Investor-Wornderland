import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { aiLogs } from '@/lib/db/schema';
import { env } from '@/lib/env';

/**
 * Rolling 30-day spend cap. If a workspace exceeds AI_MONTHLY_CAP_USD,
 * concierge/drafter/strategist calls short-circuit with a graceful
 * refusal and the founder is notified (email + audit).
 */
export async function getRolling30dUsdMicro(workspaceId: string): Promise<number> {
  const rows = await db.execute<{ total: number | null }>(sql`
    SELECT COALESCE(SUM(${aiLogs.usdCost}), 0)::bigint AS total
    FROM ${aiLogs}
    WHERE ${aiLogs.workspaceId} = ${workspaceId}
      AND ${aiLogs.createdAt} > NOW() - INTERVAL '30 days'
  `);
  const total = rows[0]?.total ?? 0;
  return Number(total);
}

export type CapState = {
  usedUsd: number;
  capUsd: number;
  utilizationPct: number;
  exceeded: boolean;
};

export async function checkCap(workspaceId: string): Promise<CapState> {
  const used = await getRolling30dUsdMicro(workspaceId);
  const usedUsd = used / 1_000_000;
  const capUsd = env.AI_MONTHLY_CAP_USD;
  const utilization = capUsd === 0 ? 0 : (usedUsd / capUsd) * 100;
  return {
    usedUsd,
    capUsd,
    utilizationPct: Math.round(utilization * 100) / 100,
    exceeded: usedUsd >= capUsd,
  };
}

export class CapExceededError extends Error {
  readonly cap: CapState;
  constructor(cap: CapState) {
    super('ai_monthly_cap_exceeded');
    this.name = 'CapExceededError';
    this.cap = cap;
  }
}
