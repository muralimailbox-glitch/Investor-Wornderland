/**
 * Pre-meeting brief. Runs hourly. For any meeting starting in 22-26 hours
 * that doesn't yet have a `meeting_prebrief_sent` note, sends a single
 * branded email to the founder summarising the investor: who they are,
 * the last 3 questions they asked Olivia, deck pages they re-opened, and
 * any notes on file. Helps the founder walk in with context.
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { firms, interactions, investors, leads, meetings, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type PreMeetingResult = {
  scanned: number;
  briefsSent: number;
};

export async function runPreMeetingBriefs(): Promise<PreMeetingResult> {
  const result: PreMeetingResult = { scanned: 0, briefsSent: 0 };

  const now = new Date();
  // Window: 22h..26h ahead. Hourly cron with 4h window absorbs missed runs.
  const windowStart = new Date(now.getTime() + 22 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      meetingId: meetings.id,
      workspaceId: meetings.workspaceId,
      leadId: meetings.leadId,
      startsAt: meetings.startsAt,
      meetLink: meetings.meetLink,
      agenda: meetings.agenda,
      stage: leads.stage,
      internalNotes: leads.internalNotes,
      investorEmail: investors.email,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      firmName: firms.name,
      briefSent: sql<boolean>`EXISTS (
        SELECT 1 FROM ${interactions} i
        WHERE i.workspace_id = ${meetings.workspaceId}
          AND i.lead_id = ${meetings.leadId}
          AND i.kind = 'note'
          AND i.payload->>'kind' = 'meeting_prebrief_sent'
          AND i.payload->>'meetingId' = ${meetings.id}::text
      )`,
    })
    .from(meetings)
    .innerJoin(leads, eq(leads.id, meetings.leadId))
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(gte(meetings.startsAt, windowStart), lte(meetings.startsAt, windowEnd)))
    .orderBy(asc(meetings.startsAt));

  result.scanned = candidates.length;

  for (const c of candidates) {
    if (c.briefSent) continue;

    // Founder for the workspace
    const [founder] = await db
      .select({ email: users.email, firstName: users.displayName })
      .from(users)
      .where(and(eq(users.workspaceId, c.workspaceId), eq(users.role, 'founder')))
      .limit(1);
    const founderEmail = founder?.email ?? env.SMTP_FROM;

    // Last 3 questions the investor asked Olivia
    const recentQs = await db
      .select({ payload: interactions.payload })
      .from(interactions)
      .where(
        and(
          eq(interactions.workspaceId, c.workspaceId),
          eq(interactions.leadId, c.leadId),
          eq(interactions.kind, 'question_asked'),
        ),
      )
      .orderBy(desc(interactions.createdAt))
      .limit(3);

    const qLines = recentQs
      .map((r) => {
        const t = (r.payload as { question?: unknown } | null)?.question;
        return typeof t === 'string' ? `• "${t.slice(0, 140)}"` : null;
      })
      .filter((s): s is string => Boolean(s))
      .join('\n');

    // Doc views in the last 7 days
    const docViews = await db
      .select({ payload: interactions.payload, createdAt: interactions.createdAt })
      .from(interactions)
      .where(
        and(
          eq(interactions.workspaceId, c.workspaceId),
          eq(interactions.leadId, c.leadId),
          eq(interactions.kind, 'document_viewed'),
          gte(interactions.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      )
      .orderBy(desc(interactions.createdAt))
      .limit(5);

    const docLines = docViews
      .map((d) => {
        const f = (d.payload as { filename?: unknown } | null)?.filename;
        return typeof f === 'string' ? `• ${f}` : null;
      })
      .filter((s): s is string => Boolean(s))
      .join('\n');

    const investorName =
      `${c.investorFirstName ?? ''} ${c.investorLastName ?? ''}`.trim() || c.investorEmail;
    const firmLabel = c.firmName ? ` (${c.firmName})` : '';

    const startStr = new Intl.DateTimeFormat(undefined, {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(c.startsAt);

    let body = `You're meeting ${investorName}${firmLabel} tomorrow.\n\n`;
    if (c.agenda) body += `AGENDA\n${c.agenda}\n\n`;
    if (qLines) body += `WHAT THEY'VE BEEN ASKING\n${qLines}\n\n`;
    if (docLines) body += `WHAT THEY'VE BEEN READING (last 7d)\n${docLines}\n\n`;
    if (c.internalNotes) body += `YOUR NOTES ON FILE\n${c.internalNotes.slice(0, 800)}\n`;

    const facts: Array<[string, string]> = [
      ['When', `${startStr} IST`],
      ['Investor', `${investorName}${firmLabel}`],
      ['Stage', c.stage.replace(/_/g, ' ')],
    ];
    if (c.meetLink) facts.push(['Google Meet', c.meetLink]);

    try {
      const email = renderBrandedEmail({
        heading: `Tomorrow's call — pre-brief`,
        body,
        facts,
        cta: [
          {
            label: 'Open lead in cockpit',
            href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/investors`,
          },
          ...(c.meetLink ? [{ label: 'Start Google Meet', href: c.meetLink }] : []),
        ],
        preFooter:
          'Sent 24h before each booking. Reply to silence future briefs for this investor.',
      });
      await sendMail({
        to: founderEmail,
        subject: `Tomorrow: ${investorName}${firmLabel} at ${startStr} IST`,
        text: email.text,
        html: email.html,
      });

      await interactionsRepo.record({
        workspaceId: c.workspaceId,
        leadId: c.leadId,
        kind: 'note',
        payload: { kind: 'meeting_prebrief_sent', meetingId: c.meetingId },
      });
      result.briefsSent++;
    } catch (err) {
      console.warn('[pre-meeting] dispatch failed', c.meetingId, err);
    }
  }

  return result;
}
