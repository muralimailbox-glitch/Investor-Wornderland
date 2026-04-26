/**
 * Backfill: ensure every investor in the workspace has an active lead on
 * the workspace's most-recent deal. Idempotent — investors that already
 * have an active lead are skipped. Safe to call repeatedly.
 *
 * Used by the "Repair Pipeline" button in the cockpit when imported
 * investors don't show up in the kanban because they were created before
 * the auto-lead-on-create rule existed.
 *
 * POST /api/v1/admin/pipeline/repair
 *   → { created, skipped, total }
 */
import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { repairPipeline } from '@/lib/services/investors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:pipeline:repair', perMinute: 5 });
  const { user } = await requireAuth({ role: 'founder' });
  const result = await repairPipeline(user.workspaceId, user.id);
  return Response.json(result);
});
