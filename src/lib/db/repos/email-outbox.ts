import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailOutbox } from '@/lib/db/schema';

export type EmailOutboxInsert = typeof emailOutbox.$inferInsert;
export type EmailOutbox = typeof emailOutbox.$inferSelect;

export const emailOutboxRepo = {
  async enqueue(input: EmailOutboxInsert) {
    const [row] = await db.insert(emailOutbox).values(input).returning();
    if (!row) throw new Error('email_outbox insert returned no row');
    return row;
  },
  async drainQueued(limit = 25) {
    return db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'queued'))
      .orderBy(asc(emailOutbox.createdAt))
      .limit(limit);
  },
  async markSent(id: string) {
    await db
      .update(emailOutbox)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(emailOutbox.id, id));
  },
  async markFailed(id: string, error: string) {
    await db
      .update(emailOutbox)
      .set({ status: 'failed', lastError: error })
      .where(eq(emailOutbox.id, id));
  },
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.workspaceId, workspaceId), eq(emailOutbox.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
};
