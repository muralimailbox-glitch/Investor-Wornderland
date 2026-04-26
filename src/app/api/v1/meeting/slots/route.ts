/**
 * Meeting slot enumeration. Returns every bookable slot in the requested
 * UTC range, with a `taken` flag for each slot already on the founder's
 * calendar. The lounge calendar component fetches one week at a time so
 * the investor can navigate forward (up to MAX_LEAD_DAYS = 14 days).
 *
 *   GET /api/v1/meeting/slots?from=ISO&to=ISO
 *     → { slots: Array<{ startsAt, endsAt, istLabel, taken }> }
 *
 * Public route — gated by NDA session cookie (rules #8, #9). Anonymous
 * visitors get 401.
 */
import { cookies } from 'next/headers';
import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { leads, meetings } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';
import { generateBookableSlotsInRange } from '@/lib/time/availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'meeting:slots', perMinute: 60 });
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    from: url.searchParams.get('from') ?? '',
    to: url.searchParams.get('to') ?? '',
  });
  if (!parsed.success) throw new ApiError(400, 'invalid_range');

  const fromUtc = new Date(parsed.data.from);
  const toUtc = new Date(parsed.data.to);
  if (toUtc.getTime() - fromUtc.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new ApiError(400, 'range_too_wide');
  }

  // Find the workspace to scope taken meetings against.
  const leadRows = await db
    .select({ workspaceId: leads.workspaceId })
    .from(leads)
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const workspaceId = leadRows[0]?.workspaceId;
  if (!workspaceId) throw new ApiError(404, 'lead_not_found');

  const taken = await db
    .select({ startsAt: meetings.startsAt, endsAt: meetings.endsAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        gte(meetings.endsAt, fromUtc),
        lte(meetings.startsAt, toUtc),
      ),
    );
  const takenStarts = new Set(taken.map((m) => m.startsAt.toISOString()));

  const generated = generateBookableSlotsInRange(fromUtc, toUtc, 30, 30);
  const slots = generated.map((s) => ({
    ...s,
    taken: takenStarts.has(s.startsAt),
  }));

  return Response.json({ slots, fromUtc: fromUtc.toISOString(), toUtc: toUtc.toISOString() });
});
