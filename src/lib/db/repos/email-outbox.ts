import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailOutbox } from '@/lib/db/schema';

export type EmailOutboxInsert = typeof emailOutbox.$inferInsert;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type EmailOutboxStatus = EmailOutbox['status'];

export const emailOutboxRepo = {
  /** Generic insert (back-compat with batch service). Defaults to status='draft'. */
  async enqueue(input: EmailOutboxInsert) {
    const [row] = await db.insert(emailOutbox).values(input).returning();
    if (!row) throw new Error('email_outbox insert returned no row');
    return row;
  },
  /** Insert a row in the new draft state — every AI/founder draft starts here. */
  async enqueueDraft(input: Omit<EmailOutboxInsert, 'status'>) {
    return this.enqueue({ ...input, status: 'draft' as const });
  },
  /** Founder approval. Idempotent — only flips draft → approved. */
  async approve(workspaceId: string, id: string, actorUserId: string) {
    const [row] = await db
      .update(emailOutbox)
      .set({ status: 'approved', approvedBy: actorUserId, approvedAt: new Date() })
      .where(
        and(
          eq(emailOutbox.workspaceId, workspaceId),
          eq(emailOutbox.id, id),
          eq(emailOutbox.status, 'draft'),
        ),
      )
      .returning();
    return row ?? null;
  },
  /** Drain rows ready for SMTP. After approval gate, the pump only sends 'approved'. */
  async drainApproved(limit = 25) {
    return db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'approved'))
      .orderBy(asc(emailOutbox.createdAt))
      .limit(limit);
  },
  /** Legacy drain — kept for migration: existing 'queued' rows still ship. */
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
  async listByStatus(workspaceId: string, statuses: EmailOutboxStatus[], limit = 100) {
    if (statuses.length === 0) return [];
    return db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.workspaceId, workspaceId), inArray(emailOutbox.status, statuses)))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(limit);
  },
};
