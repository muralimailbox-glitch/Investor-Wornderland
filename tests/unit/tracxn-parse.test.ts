import { describe, expect, it } from 'vitest';

import {
  FirmDraftSchema,
  InvestorDraftSchema,
  ParseResultSchema,
} from '@/lib/services/tracxn-import';

describe('tracxn parse schemas', () => {
  it('accepts a minimal firm', () => {
    const parsed = FirmDraftSchema.parse({ name: 'Sequoia India' });
    expect(parsed.name).toBe('Sequoia India');
  });

  it('accepts a fully populated firm with portfolio analytics', () => {
    const parsed = FirmDraftSchema.parse({
      name: 'Accel',
      firmType: 'vc',
      hqCity: 'Bengaluru',
      hqCountry: 'India',
      websiteUrl: 'https://accel.com',
      linkedinUrl: 'https://linkedin.com/company/accel',
      twitterHandle: '@accel',
      tracxnUrl: 'https://tracxn.com/accel',
      foundedYear: 1983,
      portfolioCount: 210,
      topSectorsInPortfolio: ['SaaS', 'Fintech'],
      topLocationsInPortfolio: ['India', 'USA'],
      topEntryRounds: ['seed', 'series_a'],
      dealsLast12Months: 14,
    });
    expect(parsed.portfolioCount).toBe(210);
    expect(parsed.topEntryRounds).toEqual(['seed', 'series_a']);
  });

  it('rejects an unknown firmType', () => {
    const result = FirmDraftSchema.safeParse({ name: 'Foo', firmType: 'not-a-type' });
    expect(result.success).toBe(false);
  });

  it('accepts a minimal investor with required fields', () => {
    const parsed = InvestorDraftSchema.parse({
      firmName: 'Accel',
      firstName: 'Anand',
      lastName: 'Daniel',
      title: 'Partner',
      decisionAuthority: 'full',
    });
    expect(parsed.firmName).toBe('Accel');
    expect(parsed.decisionAuthority).toBe('full');
  });

  it('rejects an investor missing decisionAuthority', () => {
    const result = InvestorDraftSchema.safeParse({
      firmName: 'X',
      firstName: 'Y',
      lastName: 'Z',
      title: 'Partner',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a full ParseResult', () => {
    const payload = {
      firms: [{ name: 'Accel' }],
      investors: [
        {
          firmName: 'Accel',
          firstName: 'Anand',
          lastName: 'Daniel',
          title: 'Partner',
          decisionAuthority: 'full',
          email: 'anand@accel.com',
        },
      ],
      unmatched: ['Some stray line the model could not place'],
    };
    const parsed = ParseResultSchema.parse(payload);
    expect(parsed.firms).toHaveLength(1);
    expect(parsed.investors).toHaveLength(1);
    expect(parsed.unmatched).toHaveLength(1);
  });

  it('defaults unmatched to empty array when omitted', () => {
    const parsed = ParseResultSchema.parse({
      firms: [],
      investors: [],
    });
    expect(parsed.unmatched).toEqual([]);
  });

  it('caps firms at 10 and investors at 50', () => {
    const tooManyFirms = ParseResultSchema.safeParse({
      firms: Array.from({ length: 11 }, (_, i) => ({ name: `F${i}` })),
      investors: [],
    });
    expect(tooManyFirms.success).toBe(false);
  });
});
