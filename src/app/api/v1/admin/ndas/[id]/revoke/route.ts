/**
 * Revoke an NDA. After this lands, the next public-route DB consult
 * (data-room read, document fetch, AI ask, meeting booking) rejects any
 * cookie tied to this NDA. The investor sees a "session expired" 401 on
 * their very next request — well under the SRS 10-second target.
 */
import { z } from 'zod';

import { ApiError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { ndasRepo } from '@/lib/db/repos/ndas';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

const Body = z.object({
  reason: z.string().max(500).optional(),
});

function ndaIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../ndas/:id/revoke → :id is second-to-last
  return IdSchema.parse(segments[segments.length - 2]);
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:nda:revoke', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const ndaId = ndaIdFromUrl(req.url);
  const input = Body.parse(await req.json().catch(() => ({})));

  const existing = await ndasRepo.byId(user.workspaceId, ndaId);
  if (!existing) throw new NotFoundError('nda_not_found');
  if (existing.revokedAt) {
    throw new ApiError(409, 'nda_already_revoked');
  }

  const revoked = await ndasRepo.revoke(user.workspaceId, ndaId);
  if (!revoked) throw new NotFoundError('nda_not_found');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'nda.revoke',
    targetType: 'nda',
    targetId: ndaId,
    payload: {
      reason: input.reason ?? null,
      signerEmail: existing.signerEmail,
      leadId: existing.leadId,
    },
  });

  return Response.json({
    ok: true,
    ndaId,
    revokedAt: revoked.revokedAt?.toISOString() ?? null,
  });
});
