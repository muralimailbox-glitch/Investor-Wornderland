import { and, asc, eq, ilike } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { firms } from '@/lib/db/schema';

export type FirmInsert = typeof firms.$inferInsert;
export type Firm = typeof firms.$inferSelect;

export const firmsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(firms)
      .where(and(eq(firms.workspaceId, workspaceId), eq(firms.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async list(workspaceId: string, search?: string) {
    const base = db.select().from(firms).orderBy(asc(firms.name));
    if (search && search.trim().length > 0) {
      return base.where(and(eq(firms.workspaceId, workspaceId), ilike(firms.name, `%${search}%`)));
    }
    return base.where(eq(firms.workspaceId, workspaceId));
  },
  async create(input: FirmInsert) {
    const [row] = await db.insert(firms).values(input).returning();
    if (!row) throw new Error('firm insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: Partial<FirmInsert>) {
    const [row] = await db
      .update(firms)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(firms.workspaceId, workspaceId), eq(firms.id, id)))
      .returning();
    return row ?? null;
  },
};
