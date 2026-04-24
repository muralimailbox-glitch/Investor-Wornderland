import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

export type DocumentInsert = typeof documents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;

export const documentsRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async list(workspaceId: string) {
    return db
      .select()
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .orderBy(desc(documents.createdAt));
  },
  async create(input: DocumentInsert) {
    const [row] = await db.insert(documents).values(input).returning();
    if (!row) throw new Error('document insert returned no row');
    return row;
  },
};
