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
 */
export async function rateLimit(req: Request, opts: RateLimitOpts): Promise<void> {
  const ip = extractIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  const maxTokens = opts.perMinute;
  const windowMs = 60_000;

  // Refill-and-consume in a single statement. The ON CONFLICT clause both
  // refills the bucket (capped at maxTokens) and decrements by one in the
  // same UPDATE — avoiding the "row modified twice" error that comes from
  // running refill and consume as separate CTEs.
  const result = await db.execute<{ remaining: number; retry_after_ms: number }>(sql`
    INSERT INTO rate_limits (key, tokens, refilled_at)
    VALUES (${bucketKey}, ${maxTokens} - 1, now())
    ON CONFLICT (key) DO UPDATE
      SET tokens = LEAST(
            ${maxTokens},
            rate_limits.tokens + FLOOR(
              EXTRACT(EPOCH FROM (now() - rate_limits.refilled_at))
              * 1000 / ${windowMs} * ${maxTokens}
            )::int
          ) - 1,
          refilled_at = now()
    RETURNING
      tokens AS remaining,
      CEIL(${windowMs}::numeric / ${maxTokens})::int AS retry_after_ms
  `);

  const row = result[0];
  if (!row || Number(row.remaining) < 0) {
    throw new RateLimitError(Number(row?.retry_after_ms ?? windowMs));
  }
}
