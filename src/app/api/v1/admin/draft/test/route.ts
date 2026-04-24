import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail/smtp';
import { renderByKey, TEMPLATE_KEYS } from '@/lib/mail/templates';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  templateKey: z.enum(TEMPLATE_KEYS as unknown as [string, ...string[]]),
  vars: z
    .object({
      firstName: z.string().max(80).optional(),
      subject: z.string().max(180).optional(),
      body: z.string().max(20_000).optional(),
    })
    .optional(),
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:draft:test', perMinute: 10 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = Body.parse(await req.json());

  const founderRow = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      publicEmail: users.publicEmail,
      whatsappE164: users.whatsappE164,
      signatureMarkdown: users.signatureMarkdown,
      companyName: users.companyName,
      companyWebsite: users.companyWebsite,
      companyAddress: users.companyAddress,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const founder = founderRow[0] ?? {
    displayName: null,
    email: user.email,
    publicEmail: null,
    whatsappE164: null,
    signatureMarkdown: null,
    companyName: null,
    companyWebsite: null,
    companyAddress: null,
  };

  const rendered = renderByKey(body.templateKey as (typeof TEMPLATE_KEYS)[number], {
    firstName: body.vars?.firstName ?? 'there',
    lastName: null,
    founder,
    companyName: founder.companyName ?? null,
    physicalAddress: founder.companyAddress ?? null,
    extras: {
      subject: body.vars?.subject ?? `[TEST] ${body.templateKey}`,
      heading: '',
      body: body.vars?.body ?? 'This is a test render of the template.',
    },
  });

  const info = await sendMail({
    to: founder.publicEmail ?? user.email,
    subject: `[TEST] ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'draft.test_sent',
    targetType: 'email_template',
    targetId: body.templateKey,
    payload: { toEmail: founder.publicEmail ?? user.email, messageId: info.messageId },
  });

  return Response.json({
    ok: true,
    messageId: info.messageId,
    to: founder.publicEmail ?? user.email,
  });
});
