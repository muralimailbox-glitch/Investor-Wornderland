import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { deals } from '@/lib/db/schema';

export type DealInsert = typeof deals.$inferInsert;
export type Deal = typeof deals.$inferSelect;

export const dealsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(deals)
      .where(and(eq(deals.workspaceId, workspaceId), eq(deals.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async activeForWorkspace(workspaceId: string) {
    return db
      .select()
      .from(deals)
      .where(eq(deals.workspaceId, workspaceId))
      .orderBy(desc(deals.createdAt));
  },
  async create(input: DealInsert) {
    const [row] = await db.insert(deals).values(input).returning();
    if (!row) throw new Error('deal insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<DealInsert>) {
    const [row] = await db
      .update(deals)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(deals.workspaceId, workspaceId), eq(deals.id, id)))
      .returning();
    return row ?? null;
  },
};
