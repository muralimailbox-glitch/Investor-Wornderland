import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runPreMeetingBriefs } from '@/lib/services/pre-meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: hourly. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runPreMeetingBriefs();
  return Response.json(result);
});

export const GET = POST;
