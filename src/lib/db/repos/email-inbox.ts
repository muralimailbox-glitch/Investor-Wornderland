import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailInbox } from '@/lib/db/schema';

export type EmailInboxInsert = typeof emailInbox.$inferInsert;
export type EmailInbox = typeof emailInbox.$inferSelect;

export const emailInboxRepo = {
  async record(input: EmailInboxInsert) {
    const [row] = await db.insert(emailInbox).values(input).returning();
    if (!row) throw new Error('email_inbox insert returned no row');
    return row;
  },
  async unprocessed(workspaceId: string, limit = 50) {
    return db
      .select()
      .from(emailInbox)
      .where(and(eq(emailInbox.workspaceId, workspaceId), isNull(emailInbox.processedAt)))
      .orderBy(desc(emailInbox.receivedAt))
      .limit(limit);
  },
  async markProcessed(id: string, matchedLeadId: string | null) {
    await db
      .update(emailInbox)
      .set({ processedAt: new Date(), matchedLeadId })
      .where(eq(emailInbox.id, id));
  },
};
