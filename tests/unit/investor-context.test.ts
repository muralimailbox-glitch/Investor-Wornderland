import { describe, expect, it } from 'vitest';

import { STAGE_ORDER, stageMeetsMinimum } from '@/lib/auth/investor-context';

describe('STAGE_ORDER (rule #10 ordinal)', () => {
  it('ranks pipeline stages monotonically', () => {
    expect(STAGE_ORDER.prospect).toBeLessThan(STAGE_ORDER.contacted);
    expect(STAGE_ORDER.contacted).toBeLessThan(STAGE_ORDER.engaged);
    expect(STAGE_ORDER.engaged).toBeLessThan(STAGE_ORDER.nda_pending);
    expect(STAGE_ORDER.nda_pending).toBeLessThan(STAGE_ORDER.nda_signed);
    expect(STAGE_ORDER.nda_signed).toBeLessThan(STAGE_ORDER.meeting_scheduled);
    expect(STAGE_ORDER.meeting_scheduled).toBeLessThan(STAGE_ORDER.diligence);
    expect(STAGE_ORDER.diligence).toBeLessThan(STAGE_ORDER.term_sheet);
    expect(STAGE_ORDER.term_sheet).toBeLessThan(STAGE_ORDER.funded);
  });

  it('closed_lost is lower than every other stage (negative ordinal)', () => {
    expect(STAGE_ORDER.closed_lost).toBeLessThan(STAGE_ORDER.prospect);
  });
});

describe('stageMeetsMinimum (rule #10 enforcement)', () => {
  it('passes when current >= required', () => {
    expect(stageMeetsMinimum('nda_signed', 'nda_signed')).toBe(true);
    expect(stageMeetsMinimum('term_sheet', 'nda_signed')).toBe(true);
    expect(stageMeetsMinimum('funded', 'diligence')).toBe(true);
  });

  it('fails when current < required', () => {
    expect(stageMeetsMinimum('engaged', 'nda_signed')).toBe(false);
    expect(stageMeetsMinimum('contacted', 'meeting_scheduled')).toBe(false);
    expect(stageMeetsMinimum('prospect', 'engaged')).toBe(false);
  });

  it('closed_lost loses access regardless of prior stage', () => {
    expect(stageMeetsMinimum('closed_lost', 'engaged')).toBe(false);
    expect(stageMeetsMinimum('closed_lost', 'nda_signed')).toBe(false);
  });

  it('null required = visible to any stage (NDA-only doc)', () => {
    expect(stageMeetsMinimum('engaged', null)).toBe(true);
    expect(stageMeetsMinimum('prospect', null)).toBe(true);
  });

  it('null current = no access when minimum required', () => {
    expect(stageMeetsMinimum(null, 'nda_signed')).toBe(false);
  });
});
