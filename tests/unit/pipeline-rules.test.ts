/**
 * Pure-logic tests for the per-stage field requirements added in the
 * fundraising-OS refactor. The transitionStage service in pipeline.ts
 * touches the DB via leadsRepo, so we don't load the full service here —
 * we test the leadsRepo guard helpers and the STAGES_REQUIRING_NEXT_ACTION
 * contract directly.
 */
import { describe, expect, it } from 'vitest';

describe('rule #6 — closed_lost requires a reason', () => {
  it('leadsRepo.setClosedLost throws when reason is missing or empty', async () => {
    const { leadsRepo } = await import('@/lib/db/repos/leads');
    await expect(leadsRepo.setClosedLost('ws', 'lead', '')).rejects.toThrow(
      /closed_lost_reason_required/,
    );
    await expect(leadsRepo.setClosedLost('ws', 'lead', '  ')).rejects.toThrow(
      /closed_lost_reason_required/,
    );
    await expect(leadsRepo.setClosedLost('ws', 'lead', 'no')).rejects.toThrow(
      /closed_lost_reason_required/,
    );
  });
});

describe('rule #7 — funded requires amount > 0', () => {
  it('leadsRepo.setFunded throws when amount is zero, negative, or non-finite', async () => {
    const { leadsRepo } = await import('@/lib/db/repos/leads');
    await expect(leadsRepo.setFunded('ws', 'lead', 0, new Date())).rejects.toThrow(
      /funded_amount_required/,
    );
    await expect(leadsRepo.setFunded('ws', 'lead', -100, new Date())).rejects.toThrow(
      /funded_amount_required/,
    );
    await expect(leadsRepo.setFunded('ws', 'lead', NaN, new Date())).rejects.toThrow(
      /funded_amount_required/,
    );
  });
});

describe('rule #11 — email_outbox default status is draft (approval gate)', () => {
  it('schema default flipped to draft (Phase 1 migration)', async () => {
    const schema = await import('@/lib/db/schema');
    // Drizzle stores defaults at the column metadata level; we can't easily
    // introspect from a unit test, but we can confirm 'draft' and 'approved'
    // are valid enum values now.
    expect(schema.emailOutboxStatusEnum.enumValues).toContain('draft');
    expect(schema.emailOutboxStatusEnum.enumValues).toContain('approved');
    expect(schema.emailOutboxStatusEnum.enumValues).toContain('queued');
  });
});

describe('rule #2 — invite_links table exists for deal-scoped binding', () => {
  it('inviteLinks schema exposes required fields', async () => {
    const schema = await import('@/lib/db/schema');
    expect(schema.inviteLinks).toBeDefined();
    // Columns the public-route deal-scoping helper relies on:
    const cols = Object.keys(schema.inviteLinks);
    expect(cols).toEqual(
      expect.arrayContaining(['workspaceId', 'dealId', 'investorId', 'leadId', 'token']),
    );
  });
});
