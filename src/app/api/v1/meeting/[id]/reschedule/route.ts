import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { getActiveNdaSession } from '@/lib/auth/nda-active';
import { db } from '@/lib/db/client';
import { leads, meetings } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';
import { rescheduleMeeting } from '@/lib/services/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  newStartsAt: z.string().datetime(),
  newEndsAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'meeting:reschedule', perMinute: 6 });

  const cookieStore = await cookies();
  const session = await getActiveNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.indexOf('meeting') + 1];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ title: 'invalid_meeting_id' }, { status: 400 });
  }

  // Resolve workspace via the lead bound to this NDA session, and only allow
  // rescheduling a meeting that belongs to *this* investor's lead.
  const [bound] = await db
    .select({ workspaceId: meetings.workspaceId, leadId: meetings.leadId })
    .from(meetings)
    .innerJoin(leads, eq(leads.id, meetings.leadId))
    .where(and(eq(meetings.id, id), eq(leads.id, session.leadId)))
    .limit(1);
  if (!bound) throw new ApiError(404, 'meeting_not_found');

  const body = Body.parse(await req.json());
  const result = await rescheduleMeeting({
    workspaceId: bound.workspaceId,
    meetingId: id,
    newStartsAt: body.newStartsAt,
    newEndsAt: body.newEndsAt,
    triggeredBy: 'investor',
    ...(body.reason ? { reason: body.reason } : {}),
  });
  return Response.json(result);
});
