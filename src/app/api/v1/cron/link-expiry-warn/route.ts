import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runLinkExpiryWarnings } from '@/lib/services/link-expiry-warn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: daily 04:00 UTC. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runLinkExpiryWarnings();
  return Response.json(result);
});

export const GET = POST;
