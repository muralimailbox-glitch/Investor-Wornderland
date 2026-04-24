import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { firmsRepo, type FirmInsert } from '@/lib/db/repos/firms';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  firmType: z.enum(['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate']).optional(),
  website: z.string().url().max(500).nullable().optional(),
  hqCity: z.string().max(120).nullable().optional(),
  hqCountry: z.string().max(120).nullable().optional(),
  aumUsd: z.number().int().nonnegative().nullable().optional(),
  activeFund: z.string().max(160).nullable().optional(),
  fundSizeUsd: z.number().int().nonnegative().nullable().optional(),
  stageFocus: z.array(z.string().max(40)).max(20).nullable().optional(),
  sectorFocus: z.array(z.string().max(60)).max(30).nullable().optional(),
  geographyFocus: z.array(z.string().max(80)).max(30).nullable().optional(),
  chequeMinUsd: z.number().int().nonnegative().nullable().optional(),
  chequeMaxUsd: z.number().int().nonnegative().nullable().optional(),
  leadFollow: z.string().max(40).nullable().optional(),
  boardSeatPolicy: z.string().max(80).nullable().optional(),
  portfolioCount: z.number().int().nonnegative().nullable().optional(),
  notablePortfolio: z.array(z.string().max(120)).max(40).nullable().optional(),
  competitorPortfolio: z.array(z.string().max(120)).max(40).nullable().optional(),
  notableExits: z.array(z.string().max(160)).max(30).nullable().optional(),
  decisionSpeed: z.string().max(80).nullable().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  foundedYear: z.number().int().min(1800).max(2100).nullable().optional(),
  twitterHandle: z.string().max(60).nullable().optional(),
  linkedinUrl: z.string().url().max(500).nullable().optional(),
  tracxnUrl: z.string().url().max(500).nullable().optional(),
  topSectorsInPortfolio: z.array(z.string().max(60)).max(20).nullable().optional(),
  topLocationsInPortfolio: z.array(z.string().max(60)).max(20).nullable().optional(),
  topEntryRounds: z.array(z.string().max(40)).max(20).nullable().optional(),
  dealsLast12Months: z.number().int().nonnegative().nullable().optional(),
});

function idFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 1]);
}

export const GET = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:firms:get', perMinute: 120 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const firm = await firmsRepo.byId(user.workspaceId, id);
  if (!firm) throw new NotFoundError('firm_not_found');
  return Response.json(firm);
});

export const PATCH = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:firms:patch', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const patch = PatchBody.parse(await req.json());

  const existing = await firmsRepo.byId(user.workspaceId, id);
  if (!existing) throw new NotFoundError('firm_not_found');

  const updates: Partial<FirmInsert> = {};
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

  const updated = await firmsRepo.update(user.workspaceId, id, updates);
  if (!updated) throw new NotFoundError('firm_not_found');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'firm.update',
    targetType: 'firm',
    targetId: id,
    payload: { diff },
  });

  return Response.json(updated);
});
