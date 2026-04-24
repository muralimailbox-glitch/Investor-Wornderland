import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { investors } from '@/lib/db/schema';

export type InvestorInsert = typeof investors.$inferInsert;
export type Investor = typeof investors.$inferSelect;

export const investorsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(investors)
      .where(and(eq(investors.workspaceId, workspaceId), eq(investors.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async byEmail(workspaceId: string, email: string) {
    const rows = await db
      .select()
      .from(investors)
      .where(and(eq(investors.workspaceId, workspaceId), eq(investors.email, email)))
      .limit(1);
    return rows[0] ?? null;
  },
  async listByFirm(workspaceId: string, firmId: string) {
    return db
      .select()
      .from(investors)
      .where(and(eq(investors.workspaceId, workspaceId), eq(investors.firmId, firmId)))
      .orderBy(asc(investors.lastName));
  },
  async create(input: InvestorInsert) {
    const [row] = await db.insert(investors).values(input).returning();
    if (!row) throw new Error('investor insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<InvestorInsert>) {
    const [row] = await db
      .update(investors)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(investors.workspaceId, workspaceId), eq(investors.id, id)))
      .returning();
    return row ?? null;
  },
};
