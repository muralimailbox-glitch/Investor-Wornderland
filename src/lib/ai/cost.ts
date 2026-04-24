/** Micro-USD = USD * 1_000_000 so we store integers. */

const RATES: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-7': { in: 15, out: 75 },
};

export function microUsdFor(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? { in: 3, out: 15 };
  const usd = (inputTokens / 1_000_000) * rate.in + (outputTokens / 1_000_000) * rate.out;
  return Math.round(usd * 1_000_000);
}

export function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}
