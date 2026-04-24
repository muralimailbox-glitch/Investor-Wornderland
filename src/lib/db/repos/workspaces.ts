import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';

export const workspacesRepo = {
  async byId(id: string) {
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async create(input: { name: string; aiMonthlyCapUsd?: number }) {
    const [row] = await db
      .insert(workspaces)
      .values({
        name: input.name,
        aiMonthlyCapUsd: input.aiMonthlyCapUsd ?? 50,
      })
      .returning();
    if (!row) throw new Error('workspace insert returned no row');
    return row;
  },
  async setAiEnabled(id: string, enabled: boolean) {
    await db.update(workspaces).set({ aiEnabled: enabled }).where(eq(workspaces.id, id));
  },
  async default() {
    const rows = await db.select().from(workspaces).orderBy(workspaces.createdAt).limit(1);
    return rows[0] ?? null;
  },
};
