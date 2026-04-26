import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { bookMeeting } from '@/lib/services/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Slot = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

// Accepts either a single startsAt/endsAt (legacy) or `slots: [...]` (multi-slot).
const Body = z
  .object({
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    slots: z.array(Slot).min(1).max(5).optional(),
    agenda: z.string().max(500).optional(),
  })
  .refine((b) => (b.slots && b.slots.length > 0) || (b.startsAt && b.endsAt), {
    message: 'slots_or_legacy_pair_required',
  });

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'meeting:book', perMinute: 6 });
  const input = Body.parse(await req.json());
  const params: Parameters<typeof bookMeeting>[0] = {};
  if (input.slots && input.slots.length > 0) params.slots = input.slots;
  if (input.startsAt) params.startsAt = input.startsAt;
  if (input.endsAt) params.endsAt = input.endsAt;
  if (input.agenda) params.agenda = input.agenda;
  const result = await bookMeeting(params);
  return Response.json(result);
});
