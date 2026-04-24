import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { dealsRepo } from '@/lib/db/repos/deals';
import { leadsRepo } from '@/lib/db/repos/leads';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:cockpit', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const [deals, leads] = await Promise.all([
    dealsRepo.activeForWorkspace(user.workspaceId),
    leadsRepo.pipeline(user.workspaceId),
  ]);
  const byStage = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.stage] = (acc[lead.stage] ?? 0) + 1;
    return acc;
  }, {});
  return Response.json({
    deal: deals[0] ?? null,
    leadCount: leads.length,
    byStage,
  });
});
