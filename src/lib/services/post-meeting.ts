/**
 * Post-meeting follow-up. Runs hourly. Picks up meetings whose end time fell
 * within the last 90 minutes and which don't yet have a `meeting_followup_sent`
 * note attached, sends a branded "thanks for the time" email with stage-aware
 * next-step copy, and records the note so we don't double-send.
 */
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { firms, interactions, investors, leads, meetings } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type PostMeetingResult = {
  scanned: number;
  followupsSent: number;
};

const STAGE_COPY: Record<string, { heading: string; body: string }> = {
  meeting_scheduled: {
    heading: 'Thanks for the time today',
    body: `Great to chat. As promised, the data room is open in your lounge — full deck, financial model, customer evidence, and the cap table are all there. Reply to this email or pick another slot if you want to dig into a specific area.`,
  },
  diligence: {
    heading: 'Diligence kit + next steps',
    body: `Thanks for the diligence call. The lounge has every doc we covered, plus extras you flagged. Tell me what else you need — happy to run a follow-up with the technical / GTM details.`,
  },
  term_sheet: {
    heading: 'Following up on the term sheet conversation',
    body: `Quick follow-up on what we discussed. Term sheet draft and the SAFE template are in the lounge. Let me know which mechanics you'd like to negotiate.`,
  },
};

const DEFAULT_COPY = {
  heading: 'Thanks for the time',
  body: `Appreciate you making the time. The lounge has everything we covered. Reply with anything you'd like to dig into next.`,
};

export async function runPostMeetingFollowups(): Promise<PostMeetingResult> {
  const result: PostMeetingResult = { scanned: 0, followupsSent: 0 };

  const now = new Date();
  const since = new Date(now.getTime() - 90 * 60 * 1000); // last 90 min

  // Pull every meeting that ended within the window, with already-sent flag
  // computed via NOT EXISTS subquery on the note interaction.
  const candidates = await db
    .select({
      meetingId: meetings.id,
      workspaceId: meetings.workspaceId,
      leadId: meetings.leadId,
      endsAt: meetings.endsAt,
      stage: leads.stage,
      investorEmail: investors.email,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      firmName: firms.name,
      followupSent: sql<boolean>`EXISTS (
        SELECT 1 FROM ${interactions} i
        WHERE i.workspace_id = ${meetings.workspaceId}
          AND i.lead_id = ${meetings.leadId}
          AND i.kind = 'note'
          AND i.payload->>'kind' = 'meeting_followup_sent'
          AND i.payload->>'meetingId' = ${meetings.id}::text
      )`,
    })
    .from(meetings)
    .innerJoin(leads, eq(leads.id, meetings.leadId))
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(gte(meetings.endsAt, since), lte(meetings.endsAt, now)))
    .orderBy(asc(meetings.endsAt));

  result.scanned = candidates.length;

  for (const c of candidates) {
    if (c.followupSent) continue;

    const copy = STAGE_COPY[c.stage] ?? DEFAULT_COPY;
    const investorName = c.investorFirstName ?? 'there';
    const firmLabel = c.firmName ? ` (${c.firmName})` : '';

    try {
      const email = renderBrandedEmail({
        heading: copy.heading,
        body: `Hi ${investorName} — ${copy.body}`,
        cta: [
          { label: 'Open the data room', href: `${env.NEXT_PUBLIC_SITE_URL}/lounge` },
          { label: 'Pick another time', href: `${env.NEXT_PUBLIC_SITE_URL}/lounge#calendar` },
        ],
        preFooter: 'You can reply to this email any time — it lands directly with the founders.',
      });
      await sendMail({
        to: c.investorEmail,
        subject: copy.heading,
        text: email.text,
        html: email.html,
      });

      await interactionsRepo.record({
        workspaceId: c.workspaceId,
        leadId: c.leadId,
        kind: 'note',
        payload: {
          kind: 'meeting_followup_sent',
          meetingId: c.meetingId,
          stage: c.stage,
        },
      });
      result.followupsSent++;

      console.warn(
        `[post-meeting] followup sent to ${investorName}${firmLabel} for meeting ${c.meetingId}`,
      );
    } catch (err) {
      console.warn('[post-meeting] followup failed', c.meetingId, err);
    }
  }

  return result;
}
