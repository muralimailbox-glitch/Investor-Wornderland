import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { dispatchBatch } from '@/lib/services/batch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:batch:dispatch', perMinute: 12 });
  const { user } = await requireAuth({ role: 'founder' });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  // URL shape: /api/v1/admin/batch/:id/dispatch — batchId is second-to-last segment.
  const id = IdSchema.parse(segments[segments.length - 2]);

  const result = await dispatchBatch({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    batchId: id,
  });
  return Response.json(result);
});
