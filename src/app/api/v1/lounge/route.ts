import { cookies } from 'next/headers';

import { ApiError, handle } from '@/lib/api/handle';
import { NDA_SESSION_COOKIE, readNdaSession } from '@/lib/auth/nda-session';
import { rateLimit } from '@/lib/security/rate-limit';
import { getLoungeBundle } from '@/lib/services/lounge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  // Stateless HMAC check — short-circuits before the rate-limit DB query
  const cookieStore = await cookies();
  if (!readNdaSession(cookieStore.get(NDA_SESSION_COOKIE)?.value)) {
    throw new ApiError(401, 'nda_required');
  }
  await rateLimit(req, { key: 'lounge', perMinute: 60 });
  const bundle = await getLoungeBundle();
  return Response.json(bundle);
});
