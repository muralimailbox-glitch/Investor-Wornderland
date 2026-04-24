import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { verifyTotpCode } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  currentPassword: z.string().min(1).max(128),
  currentTotp: z.string().regex(/^\d{6}$/),
  newPassword: z
    .string()
    .min(12, 'password must be at least 12 characters')
    .max(128)
    .regex(/[A-Z]/, 'needs an uppercase letter')
    .regex(/[a-z]/, 'needs a lowercase letter')
    .regex(/[0-9]/, 'needs a number'),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:auth:password', perMinute: 5 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) throw new NotFoundError('user_not_found');

  const ok = await verifyPassword(row.passwordHash, body.currentPassword);
  if (!ok) throw new ApiError(401, 'invalid_credentials');
  const totpOk = verifyTotpCode(row.totpSecret, body.currentTotp);
  if (!totpOk) throw new ApiError(401, 'invalid_credentials');

  if (body.currentPassword === body.newPassword) {
    throw new ApiError(400, 'password_unchanged');
  }

  const passwordHash = await hashPassword(body.newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'auth.password.changed',
    targetType: 'user',
    targetId: user.id,
    payload: {},
    ip: req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  return Response.json({ ok: true });
});
