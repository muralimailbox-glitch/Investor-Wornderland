/**
 * Lightweight thumbs-up / thumbs-down feedback on concierge answers.
 * Stored as a `note` interaction with payload.kind = 'concierge_feedback'
 * so it surfaces in the existing timeline + audit pipeline.
 *
 * Access model mirrors /api/v1/ask: requires an investor magic-link
 * cookie OR an active NDA session — anonymous callers get 401 (rule C /
 * business rule #5). When only an NDA session is present, workspaceId is
 * resolved from the lead row tied to that session.
 */
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ApiError, handle } from '@/lib/api/handle';
import { getInvestorContext } from '@/lib/auth/investor-context';
import { getActiveNdaSession } from '@/lib/auth/nda-active';
import { NDA_SESSION_COOKIE } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leads } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  sessionId: z.string().min(4).max(128),
  question: z.string().max(2000),
  answer: z.string().max(8000),
  rating: z.enum(['up', 'down']),
  reason: z.string().max(2000).optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'concierge:feedback', perMinute: 30 });
  const input = Body.parse(await req.json());

  const cookieStore = await cookies();
  const ndaSession = await getActiveNdaSession(cookieStore.get(NDA_SESSION_COOKIE)?.value);
  const ctx = await getInvestorContext();

  let workspaceId: string | undefined = ctx?.workspaceId;
  if (!workspaceId && ndaSession) {
    const [row] = await db
      .select({ workspaceId: leads.workspaceId })
      .from(leads)
      .where(eq(leads.id, ndaSession.leadId))
      .limit(1);
    workspaceId = row?.workspaceId;
  }
  if (!workspaceId) throw new ApiError(401, 'invite_required');

  const investorId = ctx?.session?.investorId ?? null;
  const leadId = ctx?.session?.leadId ?? ndaSession?.leadId ?? null;

  await interactionsRepo.record({
    workspaceId,
    ...(investorId ? { investorId } : {}),
    ...(leadId ? { leadId } : {}),
    kind: 'note',
    payload: {
      kind: 'concierge_feedback',
      sessionId: input.sessionId,
      rating: input.rating,
      reason: input.reason ?? null,
      question: input.question.slice(0, 1000),
      answerPreview: input.answer.slice(0, 600),
    },
  });

  return Response.json({ ok: true });
});
