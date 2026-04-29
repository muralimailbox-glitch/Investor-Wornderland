/**
 * Admin endpoints for the document-feedback inbox.
 *
 *   GET — list feedback rows with the originating document title cached
 *         (joined here rather than client-side so the inbox renders in
 *         one fetch and survives soft-deleted documents). Optional
 *         ?status=unread filter excludes acknowledged rows.
 *
 *   PATCH — toggle acknowledgement on a single row. The cockpit alert
 *           badge counts non-acknowledged rows, so flipping this is what
 *           clears the badge.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { documentFeedback, documents } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  status: z.enum(['unread', 'all']).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:document-feedback:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const q = ListQuery.parse(Object.fromEntries(url.searchParams));

  const conds = [eq(documentFeedback.workspaceId, user.workspaceId)];
  if (q.status === 'unread') conds.push(isNull(documentFeedback.acknowledgedAt));

  const rows = await db
    .select({
      id: documentFeedback.id,
      kind: documentFeedback.kind,
      rating: documentFeedback.rating,
      message: documentFeedback.message,
      requestedTitle: documentFeedback.requestedTitle,
      submittedByEmail: documentFeedback.submittedByEmail,
      acknowledgedAt: documentFeedback.acknowledgedAt,
      createdAt: documentFeedback.createdAt,
      documentId: documentFeedback.documentId,
      documentTitle: documents.title,
      documentFilename: documents.originalFilename,
    })
    .from(documentFeedback)
    .leftJoin(documents, eq(documents.id, documentFeedback.documentId))
    .where(and(...conds))
    .orderBy(desc(documentFeedback.createdAt))
    .limit(500);

  return Response.json({ rows });
});

const PatchBody = z.object({
  id: z.string().uuid(),
  acknowledged: z.boolean(),
});

export const PATCH = handle(async (req) => {
  await rateLimit(req, { key: 'admin:document-feedback:patch', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const input = PatchBody.parse(await req.json());

  const [existing] = await db
    .select({ id: documentFeedback.id })
    .from(documentFeedback)
    .where(
      and(eq(documentFeedback.id, input.id), eq(documentFeedback.workspaceId, user.workspaceId)),
    )
    .limit(1);
  if (!existing) throw new NotFoundError('feedback_not_found');

  await db
    .update(documentFeedback)
    .set({
      acknowledgedAt: input.acknowledged ? new Date() : null,
      acknowledgedBy: input.acknowledged ? user.id : null,
    })
    .where(eq(documentFeedback.id, input.id));

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'document_feedback.acknowledge',
    targetType: 'document_feedback',
    targetId: input.id,
    payload: { acknowledged: input.acknowledged },
  });

  return Response.json({ ok: true });
});
