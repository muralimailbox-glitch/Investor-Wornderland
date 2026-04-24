import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { handle } from '@/lib/api/handle';
import {
  INVESTOR_COOKIE,
  INVESTOR_LINK_TTL_DAYS,
  verifyInvestorLink,
} from '@/lib/auth/investor-link';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'invite:redeem', perMinute: 30 });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const token = segments[segments.length - 1] ?? '';

  const session = verifyInvestorLink(token);
  const base = env.NEXT_PUBLIC_SITE_URL || url.origin;

  if (!session) {
    return NextResponse.redirect(`${base}/?link=expired`);
  }

  const jar = await cookies();
  jar.set(INVESTOR_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: INVESTOR_LINK_TTL_DAYS * 24 * 60 * 60,
  });

  return NextResponse.redirect(`${base}/`);
});
