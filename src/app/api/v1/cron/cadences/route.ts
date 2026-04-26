import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { dispatchDueCadences } from '@/lib/services/cadences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: every 10 minutes. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await dispatchDueCadences();
  return Response.json(result);
});

export const GET = POST;
