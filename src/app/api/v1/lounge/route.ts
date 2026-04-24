import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { getLoungeBundle } from '@/lib/services/lounge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'lounge', perMinute: 60 });
  const bundle = await getLoungeBundle();
  return Response.json(bundle);
});
