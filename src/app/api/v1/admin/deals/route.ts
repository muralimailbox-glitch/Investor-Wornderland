import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { dealsRepo } from '@/lib/db/repos/deals';
import { deals } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateBody = z.object({
  roundLabel: z.string().min(1).max(120),
  targetSizeUsd: z.number().int().nonnegative(),
  preMoneyUsd: z.number().int().nonnegative().nullable().optional(),
  postMoneyUsd: z.number().int().nonnegative().nullable().optional(),
  committedUsd: z.number().int().nonnegative().optional(),
  seedFunded: z.boolean().optional(),
  companyType: z.string().min(1).max(80),
  incorporationCountry: z.string().min(1).max(80),
  pitchJurisdiction: z.string().min(1).max(80),
});

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:deals:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const rows = await db
    .select()
    .from(deals)
    .where(eq(deals.workspaceId, user.workspaceId))
    .orderBy(desc(deals.createdAt));
  return Response.json({ rows });
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:deals:create', perMinute: 10 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = CreateBody.parse(await req.json());
  const created = await dealsRepo.create({
    workspaceId: user.workspaceId,
    roundLabel: body.roundLabel,
    targetSizeUsd: body.targetSizeUsd,
    ...(body.preMoneyUsd !== undefined ? { preMoneyUsd: body.preMoneyUsd } : {}),
    ...(body.postMoneyUsd !== undefined ? { postMoneyUsd: body.postMoneyUsd } : {}),
    committedUsd: body.committedUsd ?? 0,
    seedFunded: body.seedFunded ?? false,
    companyType: body.companyType,
    incorporationCountry: body.incorporationCountry,
    pitchJurisdiction: body.pitchJurisdiction,
  });
  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'deal.create',
    targetType: 'deal',
    targetId: created.id,
    payload: { roundLabel: created.roundLabel, targetSizeUsd: created.targetSizeUsd },
  });
  return Response.json(created);
});
