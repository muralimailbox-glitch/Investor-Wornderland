/**
 * Automated lead-stage advancement on key interaction events.
 *
 *   email_sent      on prospect            → contacted
 *   email_received  on prospect/contacted  → engaged
 *   document_viewed on prospect/contacted  → engaged
 *   question_asked  on prospect/contacted  → engaged
 *   nda_signed      on engaged/nda_pending → nda_signed
 *   meeting_booked  on nda_signed/engaged  → meeting_scheduled
 *
 * Skips when the lead is already at or beyond the target stage, or in a
 * terminal stage (funded / closed_lost). When advancing into a stage that
 * requires next-action (rule #5), a default 3-day reminder is auto-set with
 * the workspace founder as owner so rule #5 stays satisfied without the
 * operator having to fill it in for every auto-progression.
 *
 * Every advancement records a stage_change interaction with payload.auto=true
 * and the triggering event, so the activity log is fully reconstructable.
 */
import { eq } from 'drizzle-orm';

import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leadsRepo, type Stage } from '@/lib/db/repos/leads';
import { users } from '@/lib/db/schema';

export type AutoEvent =
  | 'email_sent'
  | 'email_received'
  | 'document_viewed'
  | 'question_asked'
  | 'nda_signed'
  | 'meeting_booked';

const STAGE_ORDER: Record<Stage, number> = {
  prospect: 0,
  contacted: 1,
  engaged: 2,
  nda_pending: 3,
  nda_signed: 4,
  meeting_scheduled: 5,
  diligence: 6,
  term_sheet: 7,
  funded: 8,
  closed_lost: -1,
};

const REQUIRES_NEXT_ACTION: Stage[] = [
  'engaged',
  'nda_pending',
  'nda_signed',
  'meeting_scheduled',
  'diligence',
  'term_sheet',
];

function targetStageFor(current: Stage, event: AutoEvent): Stage | null {
  // Terminal stages don't auto-advance.
  if (current === 'funded' || current === 'closed_lost') return null;
  switch (event) {
    case 'email_sent':
      return STAGE_ORDER[current] < STAGE_ORDER['contacted'] ? 'contacted' : null;
    case 'email_received':
    case 'document_viewed':
    case 'question_asked':
      return STAGE_ORDER[current] < STAGE_ORDER['engaged'] ? 'engaged' : null;
    case 'nda_signed':
      return STAGE_ORDER[current] < STAGE_ORDER['nda_signed'] ? 'nda_signed' : null;
    case 'meeting_booked':
      return STAGE_ORDER[current] < STAGE_ORDER['meeting_scheduled'] ? 'meeting_scheduled' : null;
  }
}

/**
 * Advance the lead stage iff the event implies it. Returns the new stage
 * or null if no advancement happened. Errors are swallowed (logged) so
 * callers don't have to wrap — auto-transitions are best-effort.
 */
export async function autoAdvanceOnEvent(
  workspaceId: string,
  leadId: string,
  event: AutoEvent,
): Promise<Stage | null> {
  try {
    const lead = await leadsRepo.byId(workspaceId, leadId);
    if (!lead) return null;
    const target = targetStageFor(lead.stage, event);
    if (!target) return null;

    // Rule #5 — if the target stage needs a next-action and one isn't set,
    // default to a 3-day reminder owned by the workspace founder.
    if (REQUIRES_NEXT_ACTION.includes(target) && (!lead.nextActionOwner || !lead.nextActionDue)) {
      const founder = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.workspaceId, workspaceId))
        .limit(1);
      const owner = founder[0]?.email ?? 'founder';
      const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await leadsRepo.setNextAction(workspaceId, leadId, owner, due);
    }

    await leadsRepo.setStage(workspaceId, leadId, target);

    await interactionsRepo.record({
      workspaceId,
      leadId,
      kind: 'stage_change',
      payload: { from: lead.stage, to: target, auto: true, event },
    });
    await audit({
      workspaceId,
      actorUserId: lead.workspaceId, // best-effort actor for system events
      action: 'pipeline.auto_advance',
      targetType: 'lead',
      targetId: leadId,
      payload: { from: lead.stage, to: target, event },
    });

    return target;
  } catch (err) {
    console.warn(
      `[auto-transition] ${event} on lead ${leadId} failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
