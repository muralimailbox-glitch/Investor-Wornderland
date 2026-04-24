import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { buildLandingContext } from '@/lib/services/landing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'landing:context', perMinute: 120 });
  const ctx = await buildLandingContext(req);
  return Response.json(ctx);
});
