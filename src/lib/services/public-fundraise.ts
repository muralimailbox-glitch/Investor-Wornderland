/**
 * Resolves the single active OotaOS public fundraise context for routes that
 * sit outside an investor's magic-link cookie (the public /nda flow, the
 * anonymous /ask teaser before they accept a link, etc.).
 *
 * Business rule: there is exactly one active OotaOS fundraise context at a
 * time — founder workspace + most-recent deal in that workspace. We
 * intentionally avoid:
 *
 *  - workspacesRepo.default() / "first row" fallbacks: any time we let the
 *    DB choose the workspace by row order, we either bind the public flow
 *    to whatever happens to come back first (silently shifts when a second
 *    workspace lands) or we leak across deals once a second deal exists.
 *
 *  - leads-first lookups: if no investor has been imported yet, leads is
 *    empty and we'd 503 even though the founder + deal are provisioned.
 *
 * Failure modes are explicit and fail-closed (rule #4):
 *   - no founder user  → 503 founder_not_provisioned
 *   - no active deal   → 503 deal_not_provisioned
 *
 * Invite-link sessions and active NDA sessions take precedence over this
 * helper (rule #3) — those carry their own dealId/leadId binding from the
 * cookie and must not be overridden by "the latest deal".
 */
import { desc, eq } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { db } from '@/lib/db/client';
import { deals, users } from '@/lib/db/schema';

export type PublicFundraiseContext = {
  workspaceId: string;
  dealId: string;
};

export async function resolvePublicFundraiseContext(): Promise<PublicFundraiseContext> {
  const [founder] = await db
    .select({ workspaceId: users.workspaceId })
    .from(users)
    .where(eq(users.role, 'founder'))
    .limit(1);

  if (!founder) throw new ApiError(503, 'founder_not_provisioned');

  const [deal] = await db
    .select({ workspaceId: deals.workspaceId, dealId: deals.id })
    .from(deals)
    .where(eq(deals.workspaceId, founder.workspaceId))
    .orderBy(desc(deals.createdAt))
    .limit(1);

  if (!deal) throw new ApiError(503, 'deal_not_provisioned');

  return { workspaceId: deal.workspaceId, dealId: deal.dealId };
}
