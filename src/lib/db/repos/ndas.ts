import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { ndas } from '@/lib/db/schema';

export type NdaInsert = typeof ndas.$inferInsert;
export type Nda = typeof ndas.$inferSelect;

export const ndasRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(ndas)
      .where(and(eq(ndas.workspaceId, workspaceId), eq(ndas.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async byLead(workspaceId: string, leadId: string) {
    const rows = await db
      .select()
      .from(ndas)
      .where(and(eq(ndas.workspaceId, workspaceId), eq(ndas.leadId, leadId)))
      .orderBy(desc(ndas.signedAt));
    return rows[0] ?? null;
  },
  async create(input: NdaInsert) {
    const [row] = await db.insert(ndas).values(input).returning();
    if (!row) throw new Error('nda insert returned no row');
    return row;
  },
};
