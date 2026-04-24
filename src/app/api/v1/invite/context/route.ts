import { cookies } from 'next/headers';

import { handle } from '@/lib/api/handle';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'invite:context', perMinute: 60 });
  const jar = await cookies();
  const token = jar.get(INVESTOR_COOKIE)?.value;
  const session = verifyInvestorLink(token);
  if (!session) {
    return Response.json({ authenticated: false });
  }
  return Response.json({
    authenticated: true,
    investorId: session.investorId,
    firstName: session.firstName,
    lastName: session.lastName,
    firmName: session.firmName,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});
