import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { shareLinks } from '@/lib/db/schema';

export type ShareLinkInsert = typeof shareLinks.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;

export const shareLinksRepo = {
  async byToken(token: string) {
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
    return rows[0] ?? null;
  },
  async listForLead(workspaceId: string, leadId: string) {
    return db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.workspaceId, workspaceId), eq(shareLinks.leadId, leadId)));
  },
  async create(input: ShareLinkInsert) {
    const [row] = await db.insert(shareLinks).values(input).returning();
    if (!row) throw new Error('share_link insert returned no row');
    return row;
  },
  async revoke(workspaceId: string, id: string) {
    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.workspaceId, workspaceId), eq(shareLinks.id, id)));
  },
};
