import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { bulkImport, FirmDraftSchema, InvestorDraftSchema } from '@/lib/services/tracxn-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  firms: z.array(FirmDraftSchema).max(10).optional(),
  investors: z.array(InvestorDraftSchema).min(1).max(50),
  dryRun: z.boolean().optional(),
  idempotencyKey: z.string().max(128).optional(),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:investors:bulk-import', perMinute: 10 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const result = await bulkImport(
    user.workspaceId,
    { firms: body.firms ?? [], investors: body.investors },
    { dryRun: Boolean(body.dryRun) },
  );

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: body.dryRun ? 'investors.bulk_import.dry_run' : 'investors.bulk_import',
    targetType: 'investors',
    payload: {
      firmsCreated: result.firmsCreated,
      firmsUpdated: result.firmsUpdated,
      investorsCreated: result.investorsCreated,
      investorsUpdated: result.investorsUpdated,
      idempotencyKey: body.idempotencyKey ?? null,
    },
  });

  return Response.json(result);
});
