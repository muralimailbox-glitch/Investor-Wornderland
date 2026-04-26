import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runInboxSync } from '@/lib/services/inbox-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Railway cron target. Schedule every 5 minutes:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/v1/cron/inbox-sync
 */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runInboxSync();
  return Response.json(result);
});

export const GET = POST;
