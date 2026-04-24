import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { aiLogs } from '@/lib/db/schema';

export type AiLogInsert = typeof aiLogs.$inferInsert;

export const aiLogsRepo = {
  async record(input: AiLogInsert) {
    const [row] = await db.insert(aiLogs).values(input).returning();
    if (!row) throw new Error('ai_log insert returned no row');
    return row;
  },
  async monthlySpendMicroUsd(workspaceId: string, sinceDays = 30): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ total: sql<number>`coalesce(sum(${aiLogs.usdCost}), 0)` })
      .from(aiLogs)
      .where(and(eq(aiLogs.workspaceId, workspaceId), gte(aiLogs.createdAt, since)));
    return Number(rows[0]?.total ?? 0);
  },
};
