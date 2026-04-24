import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { knowledgeChunks } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';
import { ingestKnowledge } from '@/lib/services/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PostBody = z.object({
  section: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  content: z.string().min(10).max(200_000),
  metadata: z.record(z.unknown()).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:knowledge:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });

  const rows = await db
    .select({
      section: knowledgeChunks.section,
      version: knowledgeChunks.version,
      chunkCount: sql<number>`count(*)::int`,
      latestCreatedAt: sql<string>`max(${knowledgeChunks.createdAt})::text`,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.workspaceId, user.workspaceId))
    .groupBy(knowledgeChunks.section, knowledgeChunks.version)
    .orderBy(asc(knowledgeChunks.section), desc(knowledgeChunks.version));

  return Response.json({ sections: rows, count: rows.length });
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:knowledge:upsert', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = PostBody.parse(await req.json());

  const result = await ingestKnowledge({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    section: body.section,
    version: body.version,
    text: body.content,
    metadata: body.metadata ?? {},
  });

  return Response.json({
    section: body.section,
    version: body.version,
    chunks: result.inserted,
  });
});

const DeleteBody = z.object({
  section: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
});

export const DELETE = handle(async (req) => {
  await rateLimit(req, { key: 'admin:knowledge:delete', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = DeleteBody.parse(await req.json());

  const deleted = await db
    .delete(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.workspaceId, user.workspaceId),
        eq(knowledgeChunks.section, body.section),
        eq(knowledgeChunks.version, body.version),
      ),
    )
    .returning({ id: knowledgeChunks.id });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'knowledge.delete',
    targetType: 'knowledge',
    payload: {
      section: body.section,
      version: body.version,
      chunksDeleted: deleted.length,
    },
  });

  return Response.json({
    section: body.section,
    version: body.version,
    chunksDeleted: deleted.length,
  });
});
