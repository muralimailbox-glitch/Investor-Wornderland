import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { interactions } from '@/lib/db/schema';

export type InteractionInsert = typeof interactions.$inferInsert;
export type InteractionKind = InteractionInsert['kind'];

export const interactionsRepo = {
  async timeline(workspaceId: string, leadId: string, limit = 50) {
    return db
      .select()
      .from(interactions)
      .where(and(eq(interactions.workspaceId, workspaceId), eq(interactions.leadId, leadId)))
      .orderBy(desc(interactions.createdAt))
      .limit(limit);
  },
  async record(input: InteractionInsert) {
    const [row] = await db.insert(interactions).values(input).returning();
    if (!row) throw new Error('interaction insert returned no row');
    return row;
  },
};
