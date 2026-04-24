import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

type Role = 'founder' | 'team' | 'advisor';

export const usersRepo = {
  async byId(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async byEmail(workspaceId: string, email: string) {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.workspaceId, workspaceId), eq(users.email, email)))
      .limit(1);
    return rows[0] ?? null;
  },
  async create(input: {
    workspaceId: string;
    email: string;
    passwordHash: string;
    totpSecret: string;
    role: Role;
  }) {
    const [row] = await db.insert(users).values(input).returning();
    if (!row) throw new Error('user insert returned no row');
    return row;
  },
  async firstInWorkspace(workspaceId: string) {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.workspaceId, workspaceId))
      .orderBy(users.createdAt)
      .limit(1);
    return rows[0] ?? null;
  },
};
