import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { investorsRepo } from '@/lib/db/repos/investors';
import { rateLimit } from '@/lib/security/rate-limit';
import { updateInvestor } from '@/lib/services/investors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  firmId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(120).optional(),
  decisionAuthority: z.string().min(1).max(80).optional(),
  email: z.string().email().max(254).optional(),
  mobileE164: z
    .string()
    .regex(/^\+?\d{6,15}$/)
    .nullable()
    .optional(),
  linkedinUrl: z.string().url().max(500).nullable().optional(),
  twitterHandle: z.string().max(60).nullable().optional(),
  timezone: z.string().min(1).max(80).optional(),
  introPath: z.string().max(240).nullable().optional(),
  personalThesisNotes: z.string().max(2000).nullable().optional(),
  photoUrl: z.string().url().max(500).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  crunchbaseUrl: z.string().url().max(500).nullable().optional(),
  tracxnUrl: z.string().url().max(500).nullable().optional(),
  angellistUrl: z.string().url().max(500).nullable().optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
  checkSizeMinUsd: z.number().int().nonnegative().nullable().optional(),
  checkSizeMaxUsd: z.number().int().nonnegative().nullable().optional(),
  sectorInterests: z.array(z.string().max(60)).max(30).nullable().optional(),
  stageInterests: z.array(z.string().max(40)).max(20).nullable().optional(),
  bioSummary: z.string().max(2000).nullable().optional(),
  warmthScore: z.number().int().min(0).max(100).nullable().optional(),
});

const IdSchema = z.string().uuid();

function idFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 1]);
}

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:get', perMinute: 120 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const inv = await investorsRepo.byId(user.workspaceId, id);
  if (!inv) throw new NotFoundError('investor_not_found');
  return Response.json(inv);
});

export const PATCH = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:update', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const id = idFromUrl(req.url);
  const patch = PatchBody.parse(await req.json());
  const updated = await updateInvestor(user.workspaceId, user.id, id, patch);
  return Response.json(updated);
});
