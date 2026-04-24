import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { verifyPassword } from '@/lib/auth/password';
import { newTotpSecret, totpUri, verifyTotpCode } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  currentPassword: z.string().min(1).max(128),
  currentTotp: z.string().regex(/^\d{6}$/),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:auth:totp:reset', perMinute: 3 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) throw new NotFoundError('user_not_found');

  const ok = await verifyPassword(row.passwordHash, body.currentPassword);
  if (!ok) throw new ApiError(401, 'invalid_credentials');
  const totpOk = verifyTotpCode(row.totpSecret, body.currentTotp);
  if (!totpOk) throw new ApiError(401, 'invalid_credentials');

  const secret = newTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: secret, updatedAt: new Date() })
    .where(eq(users.id, user.id));
  const uri = totpUri(secret, row.email);

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'auth.totp.reset',
    targetType: 'user',
    targetId: user.id,
    payload: {},
    ip: req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  return Response.json({ otpauthUri: uri });
});
