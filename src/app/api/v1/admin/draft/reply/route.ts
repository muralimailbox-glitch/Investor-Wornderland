import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  inboundEmailId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  topic: z.string().min(1).max(240),
  context: z.string().max(8000).optional(),
});

/**
 * Drafter endpoint. Phase-4 stub returns a hand-written neutral reply so the
 * cockpit wiring can be validated end-to-end. Phase 5 replaces this with a
 * retrieval-grounded Claude draft.
 */
export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:reply', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const draft = `Hi,\n\nThanks for reaching out about ${body.topic}. We would love to set up a short call so we can walk you through the details in context — does next week work on your end?\n\n— OotaOS`;

  const auditPayload: Record<string, unknown> = { topic: body.topic, placeholder: true };
  if (body.leadId !== undefined) auditPayload.leadId = body.leadId;
  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.reply.generated',
    targetType: body.inboundEmailId ? 'email_inbox' : 'lead',
    targetId: body.inboundEmailId ?? body.leadId ?? null,
    payload: auditPayload,
  });

  return Response.json({
    subject: `Re: ${body.topic}`,
    bodyText: draft,
    bodyHtml: null,
    citations: [],
    placeholder: true,
  });
});
