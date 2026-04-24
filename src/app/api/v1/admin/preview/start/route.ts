import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { BadRequestError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { PREVIEW_COOKIE, signPreviewToken } from '@/lib/auth/preview';
import { db } from '@/lib/db/client';
import { investors } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  investorId: z.string().uuid().optional(),
  returnTo: z
    .string()
    .regex(/^\/[A-Za-z0-9/_-]*$/)
    .optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:preview:start', perMinute: 12 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json().catch(() => ({})));

  let investorId: string | null = null;
  if (body.investorId) {
    const row = await db
      .select({ id: investors.id })
      .from(investors)
      .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, body.investorId)))
      .limit(1);
    if (!row[0]) throw new NotFoundError('investor_not_found');
    investorId = row[0].id;
  }

  const returnTo = body.returnTo ?? '/';
  if (!returnTo.startsWith('/')) throw new BadRequestError('invalid_return_to');

  const signed = signPreviewToken({
    founderId: user.id,
    workspaceId: user.workspaceId,
    investorId,
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'preview.started',
    targetType: 'preview',
    targetId: investorId ?? 'generic',
    payload: { investorId, returnTo },
  });

  const res = Response.json({
    ok: true,
    returnTo,
    url: `${env.NEXT_PUBLIC_SITE_URL}${returnTo}`,
    expiresAt: signed.expiresAt.toISOString(),
  });
  res.headers.append(
    'Set-Cookie',
    [
      `${PREVIEW_COOKIE}=${signed.cookieValue}`,
      `Path=/`,
      `HttpOnly`,
      env.NODE_ENV === 'production' ? 'Secure' : '',
      `SameSite=Lax`,
      `Max-Age=${signed.maxAgeSeconds}`,
    ]
      .filter(Boolean)
      .join('; '),
  );
  return res;
});
