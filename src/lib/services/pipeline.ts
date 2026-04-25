import { BadRequestError, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leadsRepo, type Stage } from '@/lib/db/repos/leads';

const ALLOWED_STAGES: Stage[] = [
  'prospect',
  'contacted',
  'engaged',
  'nda_pending',
  'nda_signed',
  'meeting_scheduled',
  'diligence',
  'term_sheet',
  'funded',
  'closed_lost',
];

const VALID_TRANSITIONS: Record<Stage, Stage[]> = {
  prospect: ['contacted', 'closed_lost'],
  contacted: ['engaged', 'closed_lost'],
  engaged: ['nda_pending', 'closed_lost'],
  nda_pending: ['nda_signed', 'closed_lost'],
  nda_signed: ['meeting_scheduled', 'closed_lost'],
  meeting_scheduled: ['diligence', 'closed_lost'],
  diligence: ['term_sheet', 'closed_lost'],
  term_sheet: ['funded', 'closed_lost'],
  funded: [],
  closed_lost: [],
};

/** Stages where lead.next_action_owner + next_action_due are MANDATORY (rule #5). */
const STAGES_REQUIRING_NEXT_ACTION: Stage[] = [
  'engaged',
  'nda_pending',
  'nda_signed',
  'meeting_scheduled',
  'diligence',
  'term_sheet',
];

export async function transitionStage(input: {
  workspaceId: string;
  actorUserId: string;
  leadId: string;
  nextStage: Stage;
  reason?: string;
  force?: boolean;
  // Rule-driven extra fields the caller must supply for terminal stages:
  closedLostReason?: string;
  fundedAmountUsd?: number;
  fundedAt?: Date;
  // Rule #5 inputs — required when entering a stage in STAGES_REQUIRING_NEXT_ACTION
  // unless the lead already has them set:
  nextActionOwner?: string;
  nextActionDue?: Date;
}) {
  if (!ALLOWED_STAGES.includes(input.nextStage)) {
    throw new BadRequestError('invalid_stage');
  }

  const lead = await leadsRepo.byId(input.workspaceId, input.leadId);
  if (!lead) throw new NotFoundError('lead_not_found');

  if (!input.force) {
    const allowedNext = VALID_TRANSITIONS[lead.stage];
    if (!allowedNext.includes(input.nextStage)) {
      throw new BadRequestError(`transition_not_allowed_${lead.stage}_to_${input.nextStage}`);
    }
  }

  // Rule #6: closed_lost requires a reason.
  if (input.nextStage === 'closed_lost') {
    const reason = input.closedLostReason ?? input.reason;
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError('closed_lost_reason_required');
    }
    const updated = await leadsRepo.setClosedLost(input.workspaceId, input.leadId, reason);
    if (!updated) throw new NotFoundError('lead_not_found');
    await recordTransition(input, lead.stage, { closedLostReason: reason });
    return updated;
  }

  // Rule #7: funded requires amount + close date.
  if (input.nextStage === 'funded') {
    if (!input.fundedAmountUsd || !input.fundedAt) {
      throw new BadRequestError('funded_amount_required');
    }
    const updated = await leadsRepo.setFunded(
      input.workspaceId,
      input.leadId,
      input.fundedAmountUsd,
      input.fundedAt,
    );
    if (!updated) throw new NotFoundError('lead_not_found');
    await recordTransition(input, lead.stage, {
      fundedAmountUsd: input.fundedAmountUsd,
      fundedAt: input.fundedAt.toISOString(),
    });
    return updated;
  }

  // Rule #5: stages beyond `contacted` require next-action.
  if (STAGES_REQUIRING_NEXT_ACTION.includes(input.nextStage)) {
    const owner = input.nextActionOwner ?? lead.nextActionOwner;
    const due = input.nextActionDue ?? lead.nextActionDue;
    if (!owner || !due) {
      throw new BadRequestError('next_action_required');
    }
    // Side-effect: persist supplied next-action so the lead carries it.
    if (input.nextActionOwner || input.nextActionDue) {
      await leadsRepo.setNextAction(
        input.workspaceId,
        input.leadId,
        owner,
        due instanceof Date ? due : new Date(due),
      );
    }
  }

  const updated = await leadsRepo.setStage(input.workspaceId, input.leadId, input.nextStage);
  if (!updated) throw new NotFoundError('lead_not_found');

  await recordTransition(input, lead.stage, {});
  return updated;
}

async function recordTransition(
  input: {
    workspaceId: string;
    actorUserId: string;
    leadId: string;
    nextStage: Stage;
    reason?: string;
    force?: boolean;
  },
  fromStage: Stage,
  extra: Record<string, unknown>,
) {
  const auditPayload: Record<string, unknown> = {
    from: fromStage,
    to: input.nextStage,
    ...extra,
  };
  if (input.reason !== undefined) auditPayload.reason = input.reason;
  if (input.force) auditPayload.forced = true;

  await interactionsRepo.record({
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    kind: 'stage_change',
    payload: auditPayload,
  });

  await audit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: 'pipeline.transition',
    targetType: 'lead',
    targetId: input.leadId,
    payload: auditPayload,
  });
}
