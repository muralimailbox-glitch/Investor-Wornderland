import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { ndas } from '@/lib/db/schema';

export type NdaInsert = typeof ndas.$inferInsert;
export type Nda = typeof ndas.$inferSelect;

export const ndasRepo = {
  async byId(workspaceId: string, id: string) {
    const rows = await db
      .select()
      .from(ndas)
      .where(and(eq(ndas.workspaceId, workspaceId), eq(ndas.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },
  async byLead(workspaceId: string, leadId: string) {
    const rows = await db
      .select()
      .from(ndas)
      .where(and(eq(ndas.workspaceId, workspaceId), eq(ndas.leadId, leadId)))
      .orderBy(desc(ndas.signedAt));
    return rows[0] ?? null;
  },
  async create(input: NdaInsert) {
    const [row] = await db.insert(ndas).values(input).returning();
    if (!row) throw new Error('nda insert returned no row');
    return row;
  },
  /**
   * Revoke an NDA. The next public-route DB consult will reject any session
   * carrying this ndaId, so the investor's data-room access cuts off within
   * one request roundtrip (well under the 10-second SRS requirement).
   * Idempotent — calling on an already-revoked NDA returns the existing row.
   */
  async revoke(workspaceId: string, id: string) {
    const [row] = await db
      .update(ndas)
      .set({ revokedAt: new Date() })
      .where(and(eq(ndas.workspaceId, workspaceId), eq(ndas.id, id)))
      .returning();
    return row ?? null;
  },
  /**
   * Cheap revocation check — returns true if the NDA exists AND is not
   * revoked. Used by every public route that gates on the NDA cookie.
   */
  async isActive(ndaId: string): Promise<boolean> {
    const rows = await db
      .select({ id: ndas.id, revokedAt: ndas.revokedAt })
      .from(ndas)
      .where(eq(ndas.id, ndaId))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    return row.revokedAt === null;
  },
};
