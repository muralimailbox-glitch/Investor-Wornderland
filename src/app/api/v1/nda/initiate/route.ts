import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { initiateNda } from '@/lib/services/nda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
});

export const POST = handle(async (req) => {
  // Validate body before the rate-limit DB query so bad input returns 400 cheaply
  const { email } = Body.parse(await req.json());
  await rateLimit(req, { key: 'nda:initiate', perMinute: 6 });
  const result = await initiateNda(email);
  return Response.json(result);
});
