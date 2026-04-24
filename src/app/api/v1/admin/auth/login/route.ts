import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, BadRequestError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { lucia } from '@/lib/auth/lucia';
import { verifyPassword } from '@/lib/auth/password';
import { verifyTotpCode } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
  totpCode: z.string().regex(/^\d{6}$/),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'auth:login', perMinute: 5 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new BadRequestError('invalid_body');
  const { email, password, totpCode } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new ApiError(401, 'invalid_credentials');

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) throw new ApiError(401, 'invalid_credentials');

  const totpOk = verifyTotpCode(user.totpSecret, totpCode);
  if (!totpOk) throw new ApiError(401, 'invalid_credentials');

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(cookie.name, cookie.value, cookie.attributes);

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    payload: {},
    ip: req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  return Response.json({ ok: true, userId: user.id, role: user.role });
});
