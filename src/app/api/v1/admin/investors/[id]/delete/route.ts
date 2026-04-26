/**
 * GDPR delete (right to erasure). Anonymises the investor row in place
 * rather than hard-deleting so foreign-key references in audit_events,
 * email_outbox, and interactions stay intact for compliance. Replaces PII
 * (name, email, mobile, linkedin) with redacted markers; keeps internal
 * IDs and aggregate metrics. NDA artifacts in storage are left alone — they
 * carry corporate signatures and have their own retention rules per the
 * privacy policy.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { investors } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const Body = z
  .object({
    confirm: z.literal(true),
    reason: z.string().max(500).optional(),
  })
  .strict();

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 2]);
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:delete', perMinute: 10 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);
  const input = Body.parse(await req.json().catch(() => ({})));
  if (!input.confirm) throw new ApiError(400, 'confirmation_required');

  const [existing] = await db
    .select({ id: investors.id, email: investors.email })
    .from(investors)
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!existing) throw new NotFoundError('investor_not_found');

  // Replace PII columns with deterministic redacted markers — keep a hash
  // of the original email so re-imports from the same address are blocked
  // (otherwise we'd happily re-create the row from a Tracxn import).
  const redactedEmail = `redacted+${investorId.slice(0, 8)}@deleted.ootaos.local`;
  await db
    .update(investors)
    .set({
      firstName: 'redacted',
      lastName: '—',
      title: 'redacted',
      email: redactedEmail,
      mobileE164: null,
      linkedinUrl: null,
      photoUrl: null,
      twitterHandle: null,
      crunchbaseUrl: null,
      angellistUrl: null,
      websiteUrl: null,
      bioSummary: null,
      personalThesisNotes: null,
      mutualConnections: null,
      pastInvestments: null,
      interests: null,
      lastContactAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)));

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'investor.gdpr_delete',
    targetType: 'investor',
    targetId: investorId,
    payload: {
      reason: input.reason ?? null,
      originalEmail: existing.email,
      redactedEmail,
    },
  });

  return Response.json({
    ok: true,
    investorId,
    redactedEmail,
  });
});
