import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super('rate-limited');
    this.name = 'RateLimitError';
  }
}

type RateLimitOpts = {
  key: string;
  perMinute: number;
};

function extractIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Token-bucket rate limiter backed by the `rate_limits` table.
 * Each (key, ip) pair gets `perMinute` tokens that refill linearly over 60s.
 * Throws RateLimitError when the bucket is empty.
 *
 * Two correctness invariants this enforces (the previous version violated
 * both, letting a noisy client push tokens arbitrarily negative and shift
 * refilled_at forward forever):
 *
 *   1. Tokens never go below 0 — the UPDATE only fires when refill yielded
 *      at least one token to spend. WHERE clause gates that.
 *   2. refilled_at only advances when we actually granted a refill. If the
 *      bucket is empty, the row is left untouched (no UPDATE) so the next
 *      refill calculation is anchored to the original window.
 *
 * Detection model: when WHERE fails, ON CONFLICT does nothing and RETURNING
 * yields no row. Empty result = rate-limited.
 */
export async function rateLimit(req: Request, opts: RateLimitOpts): Promise<void> {
  const ip = extractIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  const maxTokens = opts.perMinute;
  const windowMs = 60_000;

  const result = await db.execute<{ remaining: number; retry_after_ms: number }>(sql`
    INSERT INTO rate_limits (key, tokens, refilled_at)
    VALUES (${bucketKey}, ${maxTokens} - 1, now())
    ON CONFLICT (key) DO UPDATE
      SET tokens = LEAST(
            ${maxTokens},
            GREATEST(rate_limits.tokens, 0) + FLOOR(
              EXTRACT(EPOCH FROM (now() - rate_limits.refilled_at))
              * 1000 / ${windowMs} * ${maxTokens}
            )::int
          ) - 1,
          refilled_at = now()
      WHERE LEAST(
            ${maxTokens},
            GREATEST(rate_limits.tokens, 0) + FLOOR(
              EXTRACT(EPOCH FROM (now() - rate_limits.refilled_at))
              * 1000 / ${windowMs} * ${maxTokens}
            )::int
          ) >= 1
    RETURNING
      tokens AS remaining,
      CEIL(${windowMs}::numeric / ${maxTokens})::int AS retry_after_ms
  `);

  if (result.length === 0) {
    throw new RateLimitError(Math.ceil(windowMs / maxTokens));
  }
}
