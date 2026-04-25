/**
 * Lead-gate — enforces rules #2 and #3 of the fundraising-OS:
 *   #2. Every active investor must have a lead for the active deal.
 *   #3. No outreach (draft/send/meeting/nda) without a lead.
 *
 * Every entry point that creates outbound action — draft generation, draft
 * approval, draft send, batch dispatch, meeting booking, NDA initiation —
 * must call requireLeadForOutreach() first.
 */
import { eq } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { db } from '@/lib/db/client';
import { leadsRepo } from '@/lib/db/repos/leads';
import { deals } from '@/lib/db/schema';

export class LeadRequiredError extends ApiError {
  constructor(message = 'lead_required') {
    super(409, message);
  }
}

/**
 * Resolve the active lead for (workspace, investor, deal). If `dealId` is
 * not supplied, falls back to the workspace's most-recent deal so legacy
 * single-deal call sites keep working during the transition.
 *
 * Throws LeadRequiredError (409) if no active lead exists. Caller is
 * responsible for catching and translating to a UX message.
 */
export async function requireLeadForOutreach(input: {
  workspaceId: string;
  investorId: string;
  dealId?: string;
}) {
  let dealId = input.dealId;
  if (!dealId) {
    const [deal] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(eq(deals.workspaceId, input.workspaceId))
      .orderBy(deals.createdAt)
      .limit(1);
    if (!deal) throw new LeadRequiredError('no_active_deal');
    dealId = deal.id;
  }

  const lead = await leadsRepo.activeForInvestorAndDeal(
    input.workspaceId,
    input.investorId,
    dealId,
  );
  if (!lead) throw new LeadRequiredError('lead_required');
  return lead;
}
