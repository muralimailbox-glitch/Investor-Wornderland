import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { meetings } from '@/lib/db/schema';

export type MeetingInsert = typeof meetings.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;

export const meetingsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(meetings)
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async forLead(workspaceId: string, leadId: string) {
    return db
      .select()
      .from(meetings)
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.leadId, leadId)))
      .orderBy(asc(meetings.startsAt));
  },
  async create(input: MeetingInsert) {
    const [row] = await db.insert(meetings).values(input).returning();
    if (!row) throw new Error('meeting insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<MeetingInsert>) {
    const [row] = await db
      .update(meetings)
      .set(patch)
      .where(and(eq(meetings.workspaceId, workspaceId), eq(meetings.id, id)))
      .returning();
    return row ?? null;
  },
};
