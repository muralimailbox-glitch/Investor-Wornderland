import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { signInvestorLink } from '@/lib/auth/investor-link';
import { db } from '@/lib/db/client';
import { firms, investors, leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

const Body = z.object({
  /** If true, also email the link to the investor with a branded template. */
  sendEmail: z.boolean().default(false),
  /** Optional custom intro line for the email body. */
  introLine: z.string().max(600).optional(),
});

function investorIdFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../investors/:id/invite-link → id is second-to-last
  return IdSchema.parse(segments[segments.length - 2]);
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:invite-link:issue', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const investorId = investorIdFromUrl(req.url);
  const input = Body.parse(await req.json().catch(() => ({})));

  const [row] = await db
    .select({
      investor: investors,
      firmName: firms.name,
    })
    .from(investors)
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(eq(investors.workspaceId, user.workspaceId), eq(investors.id, investorId)))
    .limit(1);
  if (!row) throw new NotFoundError('investor_not_found');

  // Resolve the most recently-touched lead so the cookie carries deal/lead binding.
  const [lead] = await db
    .select({ id: leads.id, dealId: leads.dealId })
    .from(leads)
    .where(and(eq(leads.workspaceId, user.workspaceId), eq(leads.investorId, investorId)))
    .orderBy(desc(leads.stageEnteredAt))
    .limit(1);

  const link = signInvestorLink({
    investorId: row.investor.id,
    workspaceId: user.workspaceId,
    ...(lead?.dealId ? { dealId: lead.dealId } : {}),
    ...(lead?.id ? { leadId: lead.id } : {}),
    firmId: row.investor.firmId,
    firstName: row.investor.firstName,
    lastName: row.investor.lastName,
    firmName: row.firmName ?? null,
  });

  const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/i/${link.token}`;

  if (input.sendEmail) {
    try {
      const intro =
        input.introLine ??
        `Here's your private link to the OotaOS investor lounge — sign the NDA once and the data room, the founder calendar, and the AI concierge are all open to you.`;
      const body = renderBrandedEmail({
        heading: `${row.investor.firstName ?? 'Hi'} — your OotaOS investor lounge link`,
        body: intro,
        cta: [{ label: 'Open the lounge', href: url }],
        preFooter: `This link expires on ${link.expiresAt.toUTCString()}. If you need a fresh one any time, just reply to this email.`,
      });
      await sendMail({
        to: row.investor.email,
        subject: `Your OotaOS investor lounge — private link`,
        text: body.text,
        html: body.html,
      });
    } catch (err) {
      console.warn('[invite-link] email failed', err);
    }
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'invite_link.issue',
    targetType: 'investor',
    targetId: investorId,
    payload: {
      sendEmail: input.sendEmail,
      expiresAt: link.expiresAt.toISOString(),
    },
  });

  return Response.json({
    url,
    expiresAt: link.expiresAt.toISOString(),
    investorEmail: row.investor.email,
  });
});
