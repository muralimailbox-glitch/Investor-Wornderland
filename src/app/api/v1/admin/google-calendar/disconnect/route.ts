import { and, eq } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { googleOauthTokens } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:google-calendar:disconnect', perMinute: 20 });
  const { user } = await requireAuth({ role: 'founder' });

  await db
    .delete(googleOauthTokens)
    .where(
      and(
        eq(googleOauthTokens.workspaceId, user.workspaceId),
        eq(googleOauthTokens.userId, user.id),
      ),
    );

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'google_calendar.disconnected',
    targetType: 'user',
    targetId: user.id,
    payload: {},
  });

  return Response.json({ ok: true });
});
