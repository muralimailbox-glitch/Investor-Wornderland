import { z } from 'zod';

import { CapExceededError } from '@/lib/ai/cap';
import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { parsePastedTracxn } from '@/lib/services/tracxn-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  raw: z.string().min(20).max(60_000),
});

export const POST = handle(async (req: Request) => {
  await rateLimit(req, { key: 'admin:tracxn:parse', perMinute: 6 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  try {
    const result = await parsePastedTracxn(user.workspaceId, body.raw);
    await audit({
      workspaceId: user.workspaceId,
      actorUserId: user.id,
      action: 'tracxn.parsed',
      targetType: 'tracxn',
      payload: {
        inputChars: body.raw.length,
        firms: result.firms.length,
        investors: result.investors.length,
        unmatched: result.unmatched.length,
      },
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CapExceededError) {
      return Response.json(
        { type: 'about:blank', title: 'ai_cap_exceeded', status: 402, cap: err.cap },
        { status: 402, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }
    throw err;
  }
});
