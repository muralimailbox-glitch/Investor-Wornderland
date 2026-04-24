import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { PREVIEW_COOKIE, verifyPreviewToken } from '@/lib/auth/preview';
import { db } from '@/lib/db/client';
import { investors } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'preview:status', perMinute: 60 });
  const cookieStore = await cookies();
  const token = cookieStore.get(PREVIEW_COOKIE)?.value;
  const session = verifyPreviewToken(token);
  if (!session) {
    return Response.json({ active: false });
  }
  let investorName: string | null = null;
  if (session.investorId) {
    const row = await db
      .select({ first: investors.firstName, last: investors.lastName })
      .from(investors)
      .where(
        and(eq(investors.workspaceId, session.workspaceId), eq(investors.id, session.investorId)),
      )
      .limit(1);
    if (row[0]) investorName = `${row[0].first} ${row[0].last}`.trim();
  }
  return Response.json({
    active: true,
    investorId: session.investorId,
    investorName,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});
