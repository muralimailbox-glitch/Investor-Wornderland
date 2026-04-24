import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { rateLimits } from '@/lib/db/schema';

/**
 * Token-bucket rate limiter keyed by (route:identity) stored in Postgres.
 * Buckets refill linearly over `windowMs` back up to `maxTokens`.
 */
export const rateLimitsRepo = {
  async consume(
    key: string,
    maxTokens: number,
    windowMs: number,
    now = new Date(),
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const result = await db.execute<{ tokens: number }>(sql`
      INSERT INTO rate_limits (key, tokens, refilled_at)
      VALUES (${key}, ${maxTokens - 1}, ${now})
      ON CONFLICT (key) DO UPDATE
        SET tokens = LEAST(
              ${maxTokens},
              rate_limits.tokens +
                FLOOR(EXTRACT(EPOCH FROM (${now}::timestamptz - rate_limits.refilled_at)) * 1000 / ${windowMs} * ${maxTokens})
            )::int - 1,
            refilled_at = ${now}
      RETURNING tokens
    `);
    const tokens = Number(result[0]?.tokens ?? 0);
    if (tokens < 0) {
      await db.update(rateLimits).set({ tokens: 0 }).where(eq(rateLimits.key, key));
      return { allowed: false, remaining: 0, retryAfterMs: Math.ceil(windowMs / maxTokens) };
    }
    return { allowed: true, remaining: tokens, retryAfterMs: 0 };
  },
};
