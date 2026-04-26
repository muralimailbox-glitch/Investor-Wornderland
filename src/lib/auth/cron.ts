/**
 * Shared-secret guard for cron routes. Railway's cron service hits each
 * scheduled URL with `Authorization: Bearer ${CRON_SECRET}` — anything else
 * is rejected. Runs in autocommit / no-DB mode so a 401 is cheap.
 *
 * If CRON_SECRET is unset (e.g. local dev), allow only local requests so
 * `pnpm dev` + curl from localhost can drive crons without leaking the
 * endpoint to the internet.
 */
import { ApiError } from '@/lib/api/handle';
import { env } from '@/lib/env';

export function requireCronAuth(req: Request): void {
  const secret = env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  const [scheme, token] = auth.split(' ');

  if (secret) {
    if (scheme !== 'Bearer' || token !== secret) {
      throw new ApiError(401, 'cron_unauthorized');
    }
    return;
  }

  // No secret configured → allow only when the call comes from localhost
  // (preventing accidental public exposure during local dev).
  const url = new URL(req.url);
  const host = (req.headers.get('host') ?? url.host).split(':')[0] ?? '';
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new ApiError(401, 'cron_secret_not_configured');
  }
}
