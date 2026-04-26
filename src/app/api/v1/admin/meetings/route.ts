import { and, asc, eq, gte } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { firms, investors, leads, meetings } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:meetings:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'upcoming'; // 'upcoming' | 'all'
  const horizon = scope === 'upcoming' ? new Date() : null;

  const baseWhere = horizon
    ? and(eq(meetings.workspaceId, user.workspaceId), gte(meetings.endsAt, horizon))
    : eq(meetings.workspaceId, user.workspaceId);

  const rows = await db
    .select({
      id: meetings.id,
      startsAt: meetings.startsAt,
      endsAt: meetings.endsAt,
      meetLink: meetings.meetLink,
      agenda: meetings.agenda,
      preBrief: meetings.preBrief,
      postNotes: meetings.postNotes,
      leadId: leads.id,
      stage: leads.stage,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      investorEmail: investors.email,
      firmName: firms.name,
    })
    .from(meetings)
    .innerJoin(leads, eq(leads.id, meetings.leadId))
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(baseWhere)
    .orderBy(asc(meetings.startsAt));

  return Response.json({
    meetings: rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      meetLink: r.meetLink,
      agenda: r.agenda,
      preBrief: r.preBrief,
      postNotes: r.postNotes,
      leadId: r.leadId,
      stage: r.stage,
      investor: {
        firstName: r.investorFirstName,
        lastName: r.investorLastName,
        email: r.investorEmail,
      },
      firmName: r.firmName,
    })),
  });
});
