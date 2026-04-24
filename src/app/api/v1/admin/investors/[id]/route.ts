import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
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
    .optional(),
  timezone: z.string().min(1).max(80).optional(),
  introPath: z.string().max(240).optional(),
  personalThesisNotes: z.string().max(2000).optional(),
});

const IdSchema = z.string().uuid();

export const PATCH = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:update', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = IdSchema.parse(segments[segments.length - 1]);
  const patch = PatchBody.parse(await req.json());
  const updated = await updateInvestor(user.workspaceId, user.id, id, patch);
  return Response.json(updated);
});
