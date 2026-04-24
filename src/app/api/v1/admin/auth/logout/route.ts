import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { clearSession, getSession } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({}).passthrough();

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'auth:logout', perMinute: 30 });
  Body.parse(await req.json().catch(() => ({})));
  const session = await getSession();
  if (session) {
    await audit({
      workspaceId: session.user.workspaceId,
      actorUserId: session.user.id,
      action: 'auth.logout',
      targetType: 'user',
      targetId: session.user.id,
      payload: {},
      ip: req.headers.get('x-forwarded-for') ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    });
  }
  await clearSession(session?.session.id);
  return Response.json({ ok: true });
});
