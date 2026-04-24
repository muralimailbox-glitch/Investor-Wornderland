import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { verifyNdaOtp } from '@/lib/services/nda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
  otp: z.string().regex(/^\d{6}$/, 'otp_must_be_6_digits'),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'nda:verify', perMinute: 10 });
  const { email, otp } = Body.parse(await req.json());
  const result = await verifyNdaOtp(email, otp);
  return Response.json(result);
});
