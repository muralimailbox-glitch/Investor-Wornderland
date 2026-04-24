import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';

export const sessionsRepo = {
  async byId(id: string) {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async create(input: { id: string; userId: string; expiresAt: Date }) {
    const [row] = await db.insert(sessions).values(input).returning();
    if (!row) throw new Error('session insert returned no row');
    return row;
  },
  async extend(id: string, expiresAt: Date) {
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  },
  async delete(id: string) {
    await db.delete(sessions).where(eq(sessions.id, id));
  },
  async deleteForUser(userId: string) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  },
};
