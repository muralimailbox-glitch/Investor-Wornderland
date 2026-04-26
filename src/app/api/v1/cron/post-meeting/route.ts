import { handle } from '@/lib/api/handle';
import { requireCronAuth } from '@/lib/auth/cron';
import { runPostMeetingFollowups } from '@/lib/services/post-meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Railway cron: hourly. */
export const POST = handle(async (req) => {
  requireCronAuth(req);
  const result = await runPostMeetingFollowups();
  return Response.json(result);
});

export const GET = POST;
