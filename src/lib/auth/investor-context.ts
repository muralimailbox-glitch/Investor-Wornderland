/**
 * Resolve the (workspace, deal, lead, investor) context for a public route
 * from the magic-link cookie. Replaces the historical `workspacesRepo.default()`
 * fallback that leaked the default workspace's data to anonymous visitors
 * (violates rules #8, #9 of the fundraising-OS).
 *
 * Backwards-compat: cookies issued before dealId was added to the payload
 * still resolve, by looking up the workspace's most-recent deal as a graceful
 * fallback. After Phase 7 cutover this fallback is removed.
 */
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';

import {
  INVESTOR_COOKIE,
  verifyInvestorLink,
  type InvestorLinkSession,
} from '@/lib/auth/investor-link';
import { db } from '@/lib/db/client';
import { leadsRepo } from '@/lib/db/repos/leads';
import { deals, investorLinkRevocations } from '@/lib/db/schema';

export type InvestorContext = {
  session: InvestorLinkSession;
  workspaceId: string;
  dealId: string;
  investorId: string;
  /** May be null if the lead has been deleted; routes should treat this as 401. */
  leadId: string | null;
};

/**
 * Read the request cookie and return a deal-scoped context, or null if
 * the cookie is missing/expired/tampered. Routes should respond 401 on null.
 */
export async function getInvestorContext(): Promise<InvestorContext | null> {
  const jar = await cookies();
  const token = jar.get(INVESTOR_COOKIE)?.value;
  const session = verifyInvestorLink(token);
  if (!session) return null;

  // Honour link revocations: a row in investor_link_revocations with
  // revokedBefore > session.issuedAt invalidates this token even though
  // the HMAC signature is still good.
  const [revocation] = await db
    .select({ revokedBefore: investorLinkRevocations.revokedBefore })
    .from(investorLinkRevocations)
    .where(
      and(
        eq(investorLinkRevocations.workspaceId, session.workspaceId),
        eq(investorLinkRevocations.investorId, session.investorId),
      ),
    )
    .limit(1);
  if (revocation && revocation.revokedBefore.getTime() > session.issuedAt) {
    return null;
  }

  let dealId = session.dealId;
  if (!dealId) {
    // Legacy cookie path — resolve workspace's most-recent deal.
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.workspaceId, session.workspaceId))
      .orderBy(deals.createdAt)
      .limit(1);
    if (!deal) return null;
    dealId = deal.id;
  }

  let leadId = session.leadId ?? null;
  if (!leadId) {
    const lead = await leadsRepo.activeForInvestorAndDeal(
      session.workspaceId,
      session.investorId,
      dealId,
    );
    leadId = lead?.id ?? null;
  }

  return {
    session,
    workspaceId: session.workspaceId,
    dealId,
    investorId: session.investorId,
    leadId,
  };
}

/**
 * Stage ordinal — used by per-stage document permissioning (rule #10).
 * Higher number = later in the funnel.
 */
export const STAGE_ORDER = {
  prospect: 0,
  contacted: 1,
  engaged: 2,
  nda_pending: 3,
  nda_signed: 4,
  meeting_scheduled: 5,
  diligence: 6,
  term_sheet: 7,
  funded: 8,
  closed_lost: -1, // closed_lost loses access regardless of prior stage
} as const;

export type StageOrderKey = keyof typeof STAGE_ORDER;

export function stageMeetsMinimum(
  current: StageOrderKey | null | undefined,
  required: StageOrderKey | null | undefined,
): boolean {
  if (!required) return true;
  if (!current) return false;
  return STAGE_ORDER[current] >= STAGE_ORDER[required];
}
