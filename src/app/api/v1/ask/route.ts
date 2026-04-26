import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { runConcierge, type InvestorContext } from '@/lib/ai/agents/concierge';
import { CapExceededError } from '@/lib/ai/cap';
import { handle } from '@/lib/api/handle';
import { getInvestorContext } from '@/lib/auth/investor-context';
import { getActiveNdaSession } from '@/lib/auth/nda-active';
import { NDA_SESSION_COOKIE } from '@/lib/auth/nda-session';
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
  "I'm getting set up for visitors right now — the founders are reachable at info@ootaos.com and respond within a few hours. Want a private link to the lounge with the data room? Reply with your name + firm.";

export const POST = handle(async (req) => {
  // Tighter limit for anonymous so a curious visitor can't burn AI budget.
  // Authenticated investors get the higher 20/min ceiling.
  const ctx = await getInvestorContext();
  await rateLimit(req, {
    key: ctx ? 'ask:auth' : 'ask:anon',
    perMinute: ctx ? 20 : 6,
  });
  const raw = await req.json().catch(() => ({}));
  const body = Body.parse(raw);

  const cookieStore = await cookies();
  const ndaSession = await getActiveNdaSession(cookieStore.get(NDA_SESSION_COOKIE)?.value);
  const signedNda = Boolean(ndaSession);

  // Anonymous teaser: when there's no magic-link cookie, fall back to the
  // default workspace so the concierge can still answer surface-level
  // questions about OotaOS. The concierge's depth-classifier will gate any
  // sensitive topic (cap table, financials, runway) by setting gate.needsNda
  // — the client renders the email-verify + NDA CTA off that flag.
  let workspaceId: string | undefined = ctx?.workspaceId;
  if (!workspaceId) {
    const ws = await workspacesRepo.default();
    workspaceId = ws?.id;
  }

  const linkSession = ctx?.session ?? null;
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

        // Chunk the answer into ~24-char fragments so the UI still feels
        // alive without inflating end-to-end latency. Previous per-word
        // setTimeout(12) added ~2-3 s of artificial delay per response.
        const text = result.answer;
        const chunkSize = 24;
        for (let i = 0; i < text.length; i += chunkSize) {
          send('delta', { text: text.slice(i, i + chunkSize) });
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
