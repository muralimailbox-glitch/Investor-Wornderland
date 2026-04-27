/**
 * GDPR data export. Returns a single JSON document containing every row in
 * our system tied to the investor — investor profile, leads, interactions,
 * NDAs, emails outbound, meetings — so the founder can fulfill an investor's
 * "send me my data" request in one click.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import {
  emailOutbox,
  firms,
  interactions,
  investors,
  leads,
  meetings,
  ndas,
} from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 2]);
}

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:export', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);

  const [inv] = await db
    .select({ investor: investors, firm: firms })
    .from(investors)
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!inv) throw new NotFoundError('investor_not_found');

  const leadRows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.workspaceId, user.workspaceId), eq(leads.investorId, investorId)))
    .orderBy(desc(leads.stageEnteredAt));
  const activeLead = leadRows[0] ?? null;

  const interactionRows = await db
    .select()
    .from(interactions)
    .where(
      and(eq(interactions.workspaceId, user.workspaceId), eq(interactions.investorId, investorId)),
    )
    .orderBy(desc(interactions.createdAt));

  const ndaRows = leadRows.length
    ? await db.select().from(ndas).where(eq(ndas.workspaceId, user.workspaceId))
    : [];

  const meetingRows = leadRows.length
    ? await db.select().from(meetings).where(eq(meetings.workspaceId, user.workspaceId))
    : [];

  const outbound = await db
    .select({
      id: emailOutbox.id,
      toEmail: emailOutbox.toEmail,
      subject: emailOutbox.subject,
      status: emailOutbox.status,
      sentAt: emailOutbox.sentAt,
      createdAt: emailOutbox.createdAt,
    })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, user.workspaceId),
        eq(emailOutbox.toEmail, inv.investor.email),
      ),
    );

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'investor.gdpr_export',
    targetType: 'investor',
    targetId: investorId,
    payload: {
      counts: {
        leads: leadRows.length,
        interactions: interactionRows.length,
        emailOutbound: outbound.length,
      },
    },
  });

  const filename = `ootaos-investor-${inv.investor.email}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        workspaceId: user.workspaceId,
        investor: inv.investor,
        firm: inv.firm,
        // Surface the active lead's source/referrer alongside the investor
        // so a downstream import can recreate full provenance.
        sourceOfLead: activeLead?.sourceOfLead ?? null,
        referrerName: activeLead?.referrerName ?? null,
        leads: leadRows,
        interactions: interactionRows.map((r) => ({
          id: r.id,
          kind: r.kind,
          payload: r.payload,
          createdAt: r.createdAt,
          leadId: r.leadId,
        })),
        ndas: ndaRows.filter((n) => leadRows.some((l) => l.id === n.leadId)),
        meetings: meetingRows.filter((m) => leadRows.some((l) => l.id === m.leadId)),
        emailOutbound: outbound,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    },
  );
});
