import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { BadRequestError, ForbiddenError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { lucia } from '@/lib/auth/lucia';
import { hashPassword } from '@/lib/auth/password';
import { newTotpSecret, totpUri } from '@/lib/auth/totp';
import { db } from '@/lib/db/client';
import { usersRepo } from '@/lib/db/repos/users';
import { workspacesRepo } from '@/lib/db/repos/workspaces';
import { users } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  workspaceName: z.string().min(1).max(100),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'auth:signup', perMinute: 3 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new BadRequestError('invalid_body');
  const { email, password, workspaceName } = parsed.data;

  const existing = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${users}`);
  if (Number(existing[0]?.n ?? 0) > 0) throw new ForbiddenError('signup_closed');

  const ws = await workspacesRepo.create({ name: workspaceName });
  const passwordHash = await hashPassword(password);
  const totpSecret = newTotpSecret();
  const user = await usersRepo.create({
    workspaceId: ws.id,
    email,
    passwordHash,
    totpSecret,
    role: 'founder',
  });

  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(cookie.name, cookie.value, cookie.attributes);

  await audit({
    workspaceId: ws.id,
    actorUserId: user.id,
    action: 'auth.signup',
    targetType: 'user',
    targetId: user.id,
    payload: { email },
    ip: req.headers.get('x-forwarded-for') ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  });

  return Response.json({
    userId: user.id,
    workspaceId: ws.id,
    totpUri: totpUri(totpSecret, email),
  });
});
