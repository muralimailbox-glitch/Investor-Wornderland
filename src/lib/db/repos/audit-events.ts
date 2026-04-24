import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';

export type AuditEventInsert = typeof auditEvents.$inferInsert;

export const auditEventsRepo = {
  async record(input: AuditEventInsert) {
    const [row] = await db.insert(auditEvents).values(input).returning();
    if (!row) throw new Error('audit_event insert returned no row');
    return row;
  },
  async feed(workspaceId: string, limit = 100) {
    return db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.workspaceId, workspaceId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  },
  async forTarget(workspaceId: string, targetType: string, targetId: string) {
    return db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspaceId),
          eq(auditEvents.targetType, targetType),
          eq(auditEvents.targetId, targetId),
        ),
      )
      .orderBy(desc(auditEvents.createdAt));
  },
};
