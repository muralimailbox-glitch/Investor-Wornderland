/**
 * Magic-link expiry warning. The investor magic-link cookie has a 14-day
 * TTL. At day 12 we email the investor a fresh link so they don't get
 * locked out mid-conversation. Idempotent — once a `link_expiry_warn_sent`
 * note interaction is on the lead within the last 14 days, we skip.
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { audit } from '@/lib/audit';
import { signInvestorLink } from '@/lib/auth/investor-link';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { auditEvents, firms, interactions, investors, leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { INVESTOR_SIGNOFF } from '@/lib/mail/brand';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type LinkExpiryWarnResult = {
  scanned: number;
  warned: number;
};

const TTL_DAYS = 14;
const WARN_AT_DAY = 12;

export async function runLinkExpiryWarnings(): Promise<LinkExpiryWarnResult> {
  const result: LinkExpiryWarnResult = { scanned: 0, warned: 0 };

  const now = new Date();
  // We want links issued WARN_AT_DAY..WARN_AT_DAY+1 days ago.
  const oldest = new Date(now.getTime() - (WARN_AT_DAY + 1) * 86_400_000);
  const newest = new Date(now.getTime() - WARN_AT_DAY * 86_400_000);

  const issuances = await db
    .select({
      eventId: auditEvents.id,
      workspaceId: auditEvents.workspaceId,
      investorId: auditEvents.targetId,
      createdAt: auditEvents.createdAt,
      payload: auditEvents.payload,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.action, 'invite_link.issue'),
        gte(auditEvents.createdAt, oldest),
        lte(auditEvents.createdAt, newest),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));

  result.scanned = issuances.length;

  for (const evt of issuances) {
    if (!evt.investorId) continue;

    // Resolve investor + active lead. If the founder reissued recently
    // (audit event in the last 12 days) we skip — they're not stranded.
    const [recentReissue] = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'invite_link.issue'),
          eq(auditEvents.targetId, evt.investorId),
          gte(auditEvents.createdAt, new Date(now.getTime() - WARN_AT_DAY * 86_400_000)),
        ),
      )
      .limit(1);
    if (recentReissue) continue;

    const [inv] = await db
      .select({
        investor: investors,
        firmName: firms.name,
      })
      .from(investors)
      .leftJoin(firms, eq(firms.id, investors.firmId))
      .where(and(eq(investors.workspaceId, evt.workspaceId), eq(investors.id, evt.investorId)))
      .limit(1);
    if (!inv) continue;

    const [activeLead] = await db
      .select({ id: leads.id, dealId: leads.dealId })
      .from(leads)
      .where(and(eq(leads.workspaceId, evt.workspaceId), eq(leads.investorId, evt.investorId)))
      .orderBy(desc(leads.stageEnteredAt))
      .limit(1);

    // Skip if we already warned within the last 14 days for this lead.
    const [alreadyWarned] = activeLead
      ? await db
          .select({ id: interactions.id })
          .from(interactions)
          .where(
            and(
              eq(interactions.workspaceId, evt.workspaceId),
              eq(interactions.leadId, activeLead.id),
              eq(interactions.kind, 'note'),
              sql`${interactions.payload}->>'kind' = 'link_expiry_warn_sent'`,
              gte(interactions.createdAt, new Date(now.getTime() - TTL_DAYS * 86_400_000)),
            ),
          )
          .limit(1)
      : [];
    if (alreadyWarned) continue;

    // Sign a fresh 14-day token and send the warning email.
    const link = signInvestorLink({
      investorId: inv.investor.id,
      workspaceId: evt.workspaceId,
      ...(activeLead?.dealId ? { dealId: activeLead.dealId } : {}),
      ...(activeLead?.id ? { leadId: activeLead.id } : {}),
      firmId: inv.investor.firmId,
      firstName: inv.investor.firstName,
      lastName: inv.investor.lastName,
      firmName: inv.firmName ?? null,
    });
    const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '')}/i/${link.token}`;

    try {
      const email = renderBrandedEmail({
        heading: `${inv.investor.firstName} — your OotaOS lounge link refreshes here`,
        body: `Heads up — the private link we sent you ~12 days ago is approaching its 14-day expiry. Use the new link below and it stays good for another two weeks.\n\nNothing else changes — your NDA, the data room, the founder calendar, all unchanged.`,
        cta: [{ label: 'Open the lounge', href: url }],
        preFooter: `Old link expires in ~48 hours. Reply to this email any time if you want a different cadence.`,
        signature: INVESTOR_SIGNOFF,
      });
      await sendMail({
        to: inv.investor.email,
        subject: `Your OotaOS investor lounge — refreshed link`,
        text: email.text,
        html: email.html,
      });

      if (activeLead) {
        await interactionsRepo.record({
          workspaceId: evt.workspaceId,
          leadId: activeLead.id,
          kind: 'note',
          payload: { kind: 'link_expiry_warn_sent', sourceEventId: evt.eventId },
        });
      }
      await audit({
        workspaceId: evt.workspaceId,
        actorUserId: null,
        action: 'invite_link.expiry_warn',
        targetType: 'investor',
        targetId: inv.investor.id,
        payload: { sourceEventId: evt.eventId },
      });
      result.warned++;
    } catch (err) {
      console.warn('[link-expiry-warn] failed for investor', inv.investor.id, err);
    }
  }

  return result;
}
