import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { bookMeeting } from '@/lib/services/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  agenda: z.string().max(500).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'meeting:book', perMinute: 6 });
  const input = Body.parse(await req.json());
  const params: Parameters<typeof bookMeeting>[0] = {
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
  if (input.agenda) params.agenda = input.agenda;
  const result = await bookMeeting(params);
  return Response.json(result);
});
