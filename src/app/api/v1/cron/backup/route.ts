import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runBackup } from '@/lib/services/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: daily at 02:00 UTC. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runBackup();
  return Response.json(result);
});

export const GET = POST;
