import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { db } = await import('@/lib/db/client');
  const { workspaces, users, investors } = await import('@/lib/db/schema');
  const { sql } = await import('drizzle-orm');

  const ws = await db
    .select({ id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt })
    .from(workspaces)
    .orderBy(workspaces.createdAt);
  console.log('WORKSPACES:', JSON.stringify(ws));

  const u = await db
    .select({
      email: users.email,
      role: users.role,
      workspaceId: users.workspaceId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
    .limit(10);
  console.log('USERS:', JSON.stringify(u));

  const inv = await db
    .select({ workspaceId: investors.workspaceId, count: sql<number>`count(*)::int` })
    .from(investors)
    .groupBy(investors.workspaceId);
  console.log('INV_BY_WS:', JSON.stringify(inv));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
