import { describe, expect, it } from 'vitest';

import { formatUsd, microUsdFor } from '@/lib/ai/cost';

describe('microUsdFor', () => {
  it('computes cost for known haiku model', () => {
    const result = microUsdFor('claude-haiku-4-5-20251001', 1_000_000, 1_000_000);
    expect(result).toBe(6_000_000);
  });

  it('computes cost for sonnet model', () => {
    const result = microUsdFor('claude-sonnet-4-6', 1_000_000, 1_000_000);
    expect(result).toBe(18_000_000);
  });

  it('computes cost for opus model', () => {
    const result = microUsdFor('claude-opus-4-7', 1_000_000, 1_000_000);
    expect(result).toBe(90_000_000);
  });

  it('falls back to sonnet rates for unknown model', () => {
    const result = microUsdFor('claude-unknown', 1_000_000, 1_000_000);
    expect(result).toBe(18_000_000);
  });

  it('returns 0 for zero tokens', () => {
    expect(microUsdFor('claude-haiku-4-5-20251001', 0, 0)).toBe(0);
  });

  it('rounds to integer micro-USD', () => {
    const result = microUsdFor('claude-haiku-4-5-20251001', 1, 1);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('formatUsd', () => {
  it('formats micro-USD to $x.xxxx', () => {
    expect(formatUsd(6_000_000)).toBe('$6.0000');
    expect(formatUsd(1_230)).toBe('$0.0012');
    expect(formatUsd(0)).toBe('$0.0000');
  });
});
