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

export async function transitionStage(input: {
  workspaceId: string;
  actorUserId: string;
  leadId: string;
  nextStage: Stage;
  reason?: string;
  force?: boolean;
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

  const updated = await leadsRepo.setStage(input.workspaceId, input.leadId, input.nextStage);
  if (!updated) throw new NotFoundError('lead_not_found');

  const auditPayload: Record<string, unknown> = {
    from: lead.stage,
    to: input.nextStage,
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

  return updated;
}
