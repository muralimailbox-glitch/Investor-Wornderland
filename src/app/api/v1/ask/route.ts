import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { runConcierge, type InvestorContext } from '@/lib/ai/agents/concierge';
import { CapExceededError } from '@/lib/ai/cap';
import { handle } from '@/lib/api/handle';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';
import { NDA_SESSION_COOKIE, readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { workspacesRepo } from '@/lib/db/repos/workspaces';
import { interactions, investors } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  question: z.string().min(3).max(2000),
  sessionId: z.string().min(4).max(128),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(10)
    .optional(),
});

const STATIC_FALLBACK =
  'The founders are fundraising right now and answer most investor questions within a few hours at info@ootaos.com. If you want the deep numbers, the data room opens the moment you verify your email and sign the NDA — takes about a minute.';

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'ask', perMinute: 20 });
  const raw = await req.json().catch(() => ({}));
  const body = Body.parse(raw);

  const workspace = await workspacesRepo.default();
  const workspaceId = workspace?.id;
  const cookieStore = await cookies();
  const ndaSession = readNdaSession(cookieStore.get(NDA_SESSION_COOKIE)?.value);
  const signedNda = Boolean(ndaSession);

  const investorToken = cookieStore.get(INVESTOR_COOKIE)?.value;
  const linkSession = verifyInvestorLink(investorToken);
  let investor: InvestorContext | null = null;
  if (linkSession && workspaceId) {
    const rows = await db
      .select({ emailVerifiedAt: investors.emailVerifiedAt })
      .from(investors)
      .where(and(eq(investors.workspaceId, workspaceId), eq(investors.id, linkSession.investorId)))
      .limit(1);
    investor = {
      investorId: linkSession.investorId,
      firstName: linkSession.firstName,
      lastName: linkSession.lastName,
      firmName: linkSession.firmName,
      emailVerified: Boolean(rows[0]?.emailVerifiedAt),
    };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (!workspaceId || !process.env.ANTHROPIC_API_KEY) {
          send('meta', {
            model: 'fallback',
            citations: [],
            gate: { needsEmailVerify: false, needsNda: false, topics: [] },
          });
          send('delta', { text: STATIC_FALLBACK });
          send('done', { ok: true, fallback: true });
          return;
        }

        const result = await runConcierge({
          workspaceId,
          sessionId: body.sessionId,
          question: body.question,
          history: body.history ?? [],
          signedNda,
          investor,
        });

        send('meta', {
          model: result.model,
          citations: result.citations,
          refused: result.refused,
          refusalReason: result.refusalReason ?? null,
          promptVersion: result.promptVersion,
          gate: result.gate,
        });

        const words = result.answer.split(/(\s+)/);
        for (const word of words) {
          send('delta', { text: word });
          await new Promise((r) => setTimeout(r, 12));
        }
        send('done', { ok: true });

        if (investor && workspaceId) {
          await db
            .insert(interactions)
            .values({
              workspaceId,
              investorId: investor.investorId,
              kind: 'question_asked',
              payload: {
                question: body.question.slice(0, 1000),
                depthTopics: result.depthTopics,
                citations: result.citations.map((c) => c.section),
                trust: signedNda
                  ? 'nda_signed'
                  : investor.emailVerified
                    ? 'email_verified'
                    : 'casual',
                refused: result.refused,
                sessionId: body.sessionId,
              },
            })
            .catch((e) => {
              console.warn('[ask] interaction log failed', e);
            });
        }
      } catch (err) {
        if (err instanceof CapExceededError) {
          send('meta', {
            model: 'capped',
            citations: [],
            gate: { needsEmailVerify: false, needsNda: false, topics: [] },
          });
          send('delta', {
            text: "We've hit this month's AI budget — the founders will follow up personally within a few hours. Email info@ootaos.com with your question.",
          });
          send('done', { ok: true, capped: true });
        } else {
          console.error('[ask] concierge failed', err);
          send('error', { message: 'concierge_unavailable' });
          send('done', { ok: false });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
