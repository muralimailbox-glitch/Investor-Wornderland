/**
 * Quick DB connectivity check. Called by phase-A-verify.sh.
 * Prints table names and workspace row. Exits 0 if healthy.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { db } = await import('@/lib/db/client');
  const { workspaces, firms, investors } = await import('@/lib/db/schema');
  const { sql } = await import('drizzle-orm');

  // List all tables
  const tables = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log('Tables in public schema:');
  (tables as unknown as { tablename: string }[]).forEach((t) => console.log(' •', t.tablename));

  // Workspace
  const [ws] = await db.select().from(workspaces).limit(1);
  if (!ws) {
    console.error('\n✗ No workspace found — run: pnpm db:seed');
    process.exit(1);
  }
  console.log(`\nWorkspace: ${ws.name} (${ws.id})`);

  // Counts
  const firmRow = await db
    .select({ firmCount: sql<number>`count(*)::int` })
    .from(firms)
    .where(sql`workspace_id = ${ws.id}`);
  const invRow = await db
    .select({ invCount: sql<number>`count(*)::int` })
    .from(investors)
    .where(sql`workspace_id = ${ws.id}`);

  console.log(`Firms: ${firmRow[0]?.firmCount ?? 0}   Investors: ${invRow[0]?.invCount ?? 0}`);
  console.log('\n✓ DB healthy');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ DB check failed:', err.message);
  process.exit(1);
});
