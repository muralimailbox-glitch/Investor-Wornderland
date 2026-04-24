import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema';

export type LeadInsert = typeof leads.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type Stage = Lead['stage'];

export const leadsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async pipeline(workspaceId: string) {
    return db
      .select()
      .from(leads)
      .where(eq(leads.workspaceId, workspaceId))
      .orderBy(desc(leads.updatedAt));
  },
  async byStage(workspaceId: string, stage: Stage) {
    return db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.stage, stage)))
      .orderBy(desc(leads.updatedAt));
  },
  async create(input: LeadInsert) {
    const [row] = await db.insert(leads).values(input).returning();
    if (!row) throw new Error('lead insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<LeadInsert>) {
    const [row] = await db
      .update(leads)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
  async setStage(workspaceId: string, id: string, stage: Stage) {
    const [row] = await db
      .update(leads)
      .set({ stage, stageEnteredAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, workspaceId), eq(leads.id, id)))
      .returning();
    return row ?? null;
  },
};
