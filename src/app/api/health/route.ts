import { sql } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { db } from '@/lib/db/client';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'health', perMinute: 120 });
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    console.error('[health] database unreachable:', err);
    return Response.json({ status: 'error', error: 'db-unreachable' }, { status: 503 });
  }
});
