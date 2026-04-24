import { cookies } from 'next/headers';
import { z } from 'zod';

import { runConcierge } from '@/lib/ai/agents/concierge';
import { CapExceededError } from '@/lib/ai/cap';
import { handle } from '@/lib/api/handle';
import { NDA_SESSION_COOKIE, readNdaSession } from '@/lib/auth/nda-session';
import { workspacesRepo } from '@/lib/db/repos/workspaces';
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
  'The founders are fundraising right now and answer most investor questions within a few hours at info@ootaos.com. If you want the deep numbers, the data room opens the moment you sign the NDA — takes about 40 seconds.';

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'ask', perMinute: 20 });
  const raw = await req.json().catch(() => ({}));
  const body = Body.parse(raw);

  const workspace = await workspacesRepo.default();
  const workspaceId = workspace?.id;
  const cookieStore = await cookies();
  const ndaSession = readNdaSession(cookieStore.get(NDA_SESSION_COOKIE)?.value);
  const signedNda = Boolean(ndaSession);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        if (!workspaceId || !process.env.ANTHROPIC_API_KEY) {
          send('meta', { model: 'fallback', citations: [] });
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
        });

        send('meta', {
          model: result.model,
          citations: result.citations,
          refused: result.refused,
          refusalReason: result.refusalReason ?? null,
          promptVersion: result.promptVersion,
        });

        const words = result.answer.split(/(\s+)/);
        for (const word of words) {
          send('delta', { text: word });
          await new Promise((r) => setTimeout(r, 12));
        }
        send('done', { ok: true });
      } catch (err) {
        if (err instanceof CapExceededError) {
          send('meta', { model: 'capped', citations: [] });
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
