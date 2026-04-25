import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { inviteLinks } from '@/lib/db/schema';

export type InviteLinkInsert = typeof inviteLinks.$inferInsert;
export type InviteLink = typeof inviteLinks.$inferSelect;

export const inviteLinksRepo = {
  async create(input: InviteLinkInsert) {
    const [row] = await db.insert(inviteLinks).values(input).returning();
    if (!row) throw new Error('invite_link insert returned no row');
    return row;
  },
  async byToken(token: string) {
    const rows = await db.select().from(inviteLinks).where(eq(inviteLinks.token, token)).limit(1);
    return rows[0] ?? null;
  },
  async revoke(workspaceId: string, id: string) {
    const [row] = await db
      .update(inviteLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(inviteLinks.workspaceId, workspaceId), eq(inviteLinks.id, id)))
      .returning();
    return row ?? null;
  },
};
