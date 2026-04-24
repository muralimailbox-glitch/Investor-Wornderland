import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { dealsRepo, type DealInsert } from '@/lib/db/repos/deals';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

const PatchBody = z.object({
  roundLabel: z.string().min(1).max(120).optional(),
  targetSizeUsd: z.number().int().nonnegative().optional(),
  preMoneyUsd: z.number().int().nonnegative().nullable().optional(),
  postMoneyUsd: z.number().int().nonnegative().nullable().optional(),
  committedUsd: z.number().int().nonnegative().optional(),
  seedFunded: z.boolean().optional(),
  companyType: z.string().min(1).max(80).optional(),
  incorporationCountry: z.string().min(1).max(80).optional(),
  pitchJurisdiction: z.string().min(1).max(80).optional(),
});

function idFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 1]);
}

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:deals:get', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const deal = await dealsRepo.byId(user.workspaceId, id);
  if (!deal) throw new NotFoundError('deal_not_found');
  return Response.json(deal);
});

export const PATCH = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:deals:patch', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const patch = PatchBody.parse(await req.json());

  const existing = await dealsRepo.byId(user.workspaceId, id);
  if (!existing) throw new NotFoundError('deal_not_found');

  const updates: Partial<DealInsert> = {};
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const before = (existing as Record<string, unknown>)[k];
    if (JSON.stringify(before) !== JSON.stringify(v)) {
      (updates as Record<string, unknown>)[k] = v;
      diff[k] = { before, after: v };
    }
  }
  if (Object.keys(updates).length === 0) return Response.json(existing);

  const updated = await dealsRepo.update(user.workspaceId, id, updates);
  if (!updated) throw new NotFoundError('deal_not_found');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'deal.update',
    targetType: 'deal',
    targetId: id,
    payload: { diff },
  });

  return Response.json(updated);
});
