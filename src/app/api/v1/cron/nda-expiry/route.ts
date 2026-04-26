import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runNdaExpiryWarnings } from '@/lib/services/nda-expiry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: weekly Mondays 03:00 UTC. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runNdaExpiryWarnings();
  return Response.json(result);
});

export const GET = POST;
