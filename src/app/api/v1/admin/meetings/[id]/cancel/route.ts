import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { cancelMeeting } from '@/lib/services/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  reason: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:meetings:cancel', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.indexOf('meetings') + 1];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ title: 'invalid_meeting_id' }, { status: 400 });
  }

  const body = await req
    .json()
    .catch(() => ({}))
    .then((j: unknown) => Body.parse(j ?? {}));

  await cancelMeeting({
    workspaceId: user.workspaceId,
    meetingId: id,
    ...(body.reason ? { reason: body.reason } : {}),
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'meeting.cancel',
    targetType: 'meeting',
    targetId: id,
    payload: { reason: body.reason ?? null },
  });

  return Response.json({ ok: true });
});
