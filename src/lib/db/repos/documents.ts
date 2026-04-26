import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

export type DocumentInsert = typeof documents.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentUpdate = Partial<
  Pick<
    DocumentRow,
    | 'title'
    | 'kind'
    | 'watermarkPolicy'
    | 'expiresAt'
    | 'originalFilename'
    | 'mimeType'
    | 'sizeBytes'
    | 'sha256'
    | 'r2Key'
  >
>;

export const documentsRepo = {
  /**
   * Returns the live document row. Excludes soft-deleted rows so any caller
   * that resolves a doc by id (download, version-list, replace) gets null
   * after the founder removes the doc — closing the data-room revocation
   * gap where direct URLs remained fetchable post-delete.
   */
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.id, id),
          isNull(documents.deletedAt),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },
  /** Includes soft-deleted rows. Use only for admin/audit lookups. */
  async byIdIncludingDeleted(workspaceId: string, id: string) {
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
      .where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt));
  },
  async create(input: DocumentInsert) {
    const [row] = await db.insert(documents).values(input).returning();
    if (!row) throw new Error('document insert returned no row');
    return row;
  },
  async update(workspaceId: string, id: string, patch: DocumentUpdate) {
    const [row] = await db
      .update(documents)
      .set(patch)
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
      .returning();
    return row ?? null;
  },
  async softDelete(workspaceId: string, id: string) {
    const [row] = await db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, id)))
      .returning();
    return row ?? null;
  },
};
