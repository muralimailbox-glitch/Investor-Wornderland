import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { rescheduleMeeting } from '@/lib/services/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  newStartsAt: z.string().datetime(),
  newEndsAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
  agenda: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:meetings:reschedule', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.indexOf('meetings') + 1];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ title: 'invalid_meeting_id' }, { status: 400 });
  }

  const body = Body.parse(await req.json());
  const result = await rescheduleMeeting({
    workspaceId: user.workspaceId,
    meetingId: id,
    newStartsAt: body.newStartsAt,
    newEndsAt: body.newEndsAt,
    triggeredBy: 'founder',
    ...(body.reason ? { reason: body.reason } : {}),
    ...(body.agenda ? { agenda: body.agenda } : {}),
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'meeting.reschedule',
    targetType: 'meeting',
    targetId: id,
    payload: { reason: body.reason ?? null, newStartsAt: body.newStartsAt },
  });

  return Response.json(result);
});
