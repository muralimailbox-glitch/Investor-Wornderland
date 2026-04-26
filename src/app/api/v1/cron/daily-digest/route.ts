import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runDailyDigest } from '@/lib/services/daily-digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: daily at 02:30 UTC (08:00 IST). */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runDailyDigest();
  return Response.json(result);
});

export const GET = POST;
