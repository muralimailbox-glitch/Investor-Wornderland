import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  const { db } = await import('@/lib/db/client');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`TRUNCATE rate_limits`);
  console.log('rate_limits truncated');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
