import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { interactions, investors, leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

const Body = z.object({
  channel: z.enum([
    'phone_call',
    'whatsapp',
    'in_person',
    'sms',
    'linkedin',
    'email_offline',
    'other',
  ]),
  body: z.string().min(2).max(4000),
  direction: z.enum(['inbound', 'outbound']).default('inbound'),
  /** ISO timestamp; defaults to now. Anything in the future is rejected. */
  occurredAt: z.string().datetime().optional(),
});

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../investors/:id/notes → id is second-to-last.
  return IdSchema.parse(segments[segments.length - 2]);
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:notes', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);
  const input = Body.parse(await req.json());

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (occurredAt.getTime() > Date.now() + 60_000) {
    return Response.json({ title: 'occurred_at_in_future' }, { status: 400 });
  }

  const [inv] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!inv) throw new NotFoundError('investor_not_found');

  // Resolve the most recently-touched lead so the timeline aggregates correctly.
  const [activeLead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.workspaceId, user.workspaceId), eq(leads.investorId, investorId)))
    .orderBy(desc(leads.stageEnteredAt))
    .limit(1);

  const [row] = await db
    .insert(interactions)
    .values({
      workspaceId: user.workspaceId,
      investorId,
      ...(activeLead ? { leadId: activeLead.id } : {}),
      kind: 'note',
      payload: {
        offline: true,
        channel: input.channel,
        direction: input.direction,
        body: input.body,
        occurredAt: occurredAt.toISOString(),
        loggedBy: user.id,
      },
    })
    .returning();
  if (!row) throw new Error('note insert failed');

  // Update lastContactAt on both investor and lead so dashboards/sorts pick it up.
  await db
    .update(investors)
    .set({ lastContactAt: occurredAt, updatedAt: new Date() })
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)));
  if (activeLead) {
    await db
      .update(leads)
      .set({ lastContactAt: occurredAt, updatedAt: new Date() })
      .where(and(eq(leads.workspaceId, user.workspaceId), eq(leads.id, activeLead.id)));
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'investor.note',
    targetType: 'investor',
    targetId: investorId,
    payload: {
      channel: input.channel,
      direction: input.direction,
      occurredAt: occurredAt.toISOString(),
    },
  });

  return Response.json({
    interaction: {
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    },
  });
});
