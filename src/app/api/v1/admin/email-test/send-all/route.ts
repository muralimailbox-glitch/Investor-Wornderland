/**
 * Founder-only fan-out that fires a sample of every email kind in the
 * app to a single recipient. Lets the founder QA all templates from
 * one inbox without walking through the live workflows (book a meeting,
 * sign an NDA, request a document, …) one at a time.
 *
 * POST /api/v1/admin/email-test/send-all
 *   body: { to?: string }   // defaults to krish.c@snapsitebuild.com
 *   → { sent: number, errors: Array<{ id, error }> }
 *
 * Each sample is dispatched independently so a single SMTP hiccup
 * doesn't abort the rest of the batch. Subjects are prefixed with
 * "[SAMPLE n/N · <id>]" so the inbox view shows them grouped.
 */
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { getEmailSamples } from '@/lib/mail/samples';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    to: z.string().email().max(254).optional(),
  })
  .optional();

const DEFAULT_TARGET = 'krish.c@snapsitebuild.com';

export const POST = handle(async (req: Request) => {
  // Rate-limited tighter than other admin routes — this fans out ~17
  // emails in one call. Twice a minute is plenty for QA.
  await rateLimit(req, { key: 'admin:email-test:send-all', perMinute: 2 });
  await requireAuth({ role: 'founder' });

  const parsed = Body.parse(await req.json().catch(() => ({})));
  const to = parsed?.to ?? DEFAULT_TARGET;

  const samples = getEmailSamples();
  const errors: Array<{ id: string; error: string }> = [];
  let sent = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s) continue;
    const tag = `[SAMPLE ${i + 1}/${samples.length} · ${s.id}]`;
    try {
      await sendMail({
        to,
        subject: `${tag} ${s.subject}`,
        html: s.html,
        text: `${tag}\n\n${s.text}`,
      });
      sent += 1;
    } catch (err) {
      errors.push({
        id: s.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    to,
    total: samples.length,
    sent,
    errors,
  });
});
