import { handle } from '@/lib/api/handle';
import { signChallenge } from '@/lib/auth/challenge';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'auth:login-challenge', perMinute: 20 });
  const challenge = signChallenge('login');
  return Response.json({ challenge });
});
