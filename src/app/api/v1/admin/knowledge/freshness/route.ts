import { desc, eq } from 'drizzle-orm';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { knowledgeChunks } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:kb:freshness', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });

  const [latest] = await db
    .select({ createdAt: knowledgeChunks.createdAt, version: knowledgeChunks.version })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.workspaceId, user.workspaceId))
    .orderBy(desc(knowledgeChunks.createdAt))
    .limit(1);

  const total = await db
    .select({ id: knowledgeChunks.id })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.workspaceId, user.workspaceId));

  if (!latest) {
    return Response.json({
      lastIndexedAt: null,
      ageDays: null,
      latestVersion: null,
      chunkCount: 0,
      stale: true,
      severity: 'critical' as const,
    });
  }

  const ageMs = Date.now() - latest.createdAt.getTime();
  const ageDays = Math.floor(ageMs / 86_400_000);
  const severity =
    ageDays > 21 ? 'critical' : ageDays > 7 ? 'warn' : ('ok' as 'ok' | 'warn' | 'critical');

  return Response.json({
    lastIndexedAt: latest.createdAt.toISOString(),
    latestVersion: latest.version,
    ageDays,
    chunkCount: total.length,
    stale: ageDays > 7,
    severity,
  });
});
