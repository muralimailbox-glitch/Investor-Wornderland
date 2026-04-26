/**
 * Revoke every magic link previously issued to this investor. Sets the
 * cutoff to "now"; getInvestorContext() compares the cutoff against each
 * cookie's issuedAt and rejects anything older.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { investorLinkRevocations, investors } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const Body = z.object({
  reason: z.string().max(500).optional(),
});

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 2]);
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:invite-link:revoke', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);
  const input = Body.parse(await req.json().catch(() => ({})));

  const [exists] = await db
    .select({ id: investors.id })
    .from(investors)
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!exists) throw new NotFoundError('investor_not_found');

  const cutoff = new Date();

  // Upsert: one row per (workspace, investor). If a previous revocation
  // exists, push the cutoff forward.
  const [existingRev] = await db
    .select({ id: investorLinkRevocations.id })
    .from(investorLinkRevocations)
    .where(
      and(
        eq(investorLinkRevocations.workspaceId, user.workspaceId),
        eq(investorLinkRevocations.investorId, investorId),
      ),
    )
    .limit(1);

  if (existingRev) {
    await db
      .update(investorLinkRevocations)
      .set({
        revokedBefore: cutoff,
        revokedAt: cutoff,
        revokedBy: user.id,
        ...(input.reason ? { reason: input.reason } : {}),
      })
      .where(eq(investorLinkRevocations.id, existingRev.id));
  } else {
    const insert: typeof investorLinkRevocations.$inferInsert = {
      workspaceId: user.workspaceId,
      investorId,
      revokedBefore: cutoff,
      revokedAt: cutoff,
      revokedBy: user.id,
      ...(input.reason ? { reason: input.reason } : {}),
    };
    await db.insert(investorLinkRevocations).values(insert);
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'invite_link.revoke',
    targetType: 'investor',
    targetId: investorId,
    payload: { reason: input.reason ?? null, revokedBefore: cutoff.toISOString() },
  });

  return Response.json({ ok: true, revokedBefore: cutoff.toISOString() });
});
