import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { meetingsRepo } from '@/lib/db/repos/meetings';
import { investors, leads, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mail/smtp';
import { checkAvailability, FOUNDER_TZ } from '@/lib/time/availability';
import { DEFAULT_FOUNDER_TZ, formatInTz } from '@/lib/time/tz';

export type BookMeetingInput = {
  startsAt: string;
  endsAt: string;
  agenda?: string;
};

export type BookMeetingResult = {
  meetingId: string;
  startsAt: string;
  endsAt: string;
  meetLink: string | null;
  investorTimezone: string;
  founderTimezone: string;
  investorLocalStart: string;
  founderLocalStart: string;
};

export async function bookMeeting(input: BookMeetingInput): Promise<BookMeetingResult> {
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    throw new ApiError(400, 'invalid_time');
  }
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new ApiError(400, 'invalid_time_range');
  }
  const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  const availability = checkAvailability(startsAt, durationMinutes);
  if (!availability.ok) {
    // Surface the specific reason; the public-API caller maps it to a UX message.
    throw new ApiError(400, availability.reason);
  }

  const leadRow = await db
    .select({
      lead: leads,
      investorTimezone: investors.timezone,
    })
    .from(leads)
    .leftJoin(investors, eq(investors.id, leads.investorId))
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const lead = leadRow[0]?.lead;
  if (!lead) throw new ApiError(404, 'lead_not_found');
  const investorTimezone: string = leadRow[0]?.investorTimezone ?? DEFAULT_FOUNDER_TZ;

  const founderRow = await db
    .select({ tz: users.defaultTimezone })
    .from(users)
    .where(and(eq(users.workspaceId, lead.workspaceId), eq(users.role, 'founder')))
    .limit(1);
  // Founder TZ is always IST for OotaOS — overrides any stale defaultTimezone column.
  const founderTimezone: string = founderRow[0]?.tz ?? FOUNDER_TZ ?? DEFAULT_FOUNDER_TZ;

  const conflict = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM meetings
    WHERE workspace_id = ${lead.workspaceId}
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')
  `);
  if ((conflict[0]?.count ?? 0) > 0) {
    throw new ApiError(409, 'slot_taken');
  }

  const meeting = await meetingsRepo.create({
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    startsAt,
    endsAt,
    agenda: input.agenda ?? null,
  });

  // Auto-advance to meeting_scheduled if lead isn't already further along
  // (e.g. the founder might already have moved them to diligence by hand).
  const { autoAdvanceOnEvent } = await import('@/lib/services/auto-transition');
  await autoAdvanceOnEvent(lead.workspaceId, lead.id, 'meeting_booked');
  await interactionsRepo.record({
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    kind: 'meeting_held',
    payload: { meetingId: meeting.id, scheduled: true },
  });

  const investorLocalStart = formatInTz(startsAt, investorTimezone, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const founderLocalStart = formatInTz(startsAt, founderTimezone, {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  try {
    await sendMail({
      to: session.email,
      subject: 'Your OotaOS meeting is booked',
      text: [
        'Your meeting with OotaOS is confirmed.',
        '',
        `Your time (${investorTimezone}): ${investorLocalStart}`,
        `Priya's time (${founderTimezone}): ${founderLocalStart}`,
        input.agenda ? `Agenda: ${input.agenda}` : '',
        '',
        'We will send a calendar invite shortly.',
        '',
        '— OotaOS',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    await sendMail({
      to: env.SMTP_FROM,
      subject: `Meeting booked — ${session.email} — ${founderLocalStart}`,
      text: [
        'A new investor meeting has been booked.',
        ``,
        `Email: ${session.email}`,
        `Investor time (${investorTimezone}): ${investorLocalStart}`,
        `Your time (${founderTimezone}): ${founderLocalStart}`,
        input.agenda ? `Agenda: ${input.agenda}` : '(no agenda provided)',
      ].join('\n'),
    });
  } catch (err) {
    console.warn('[meeting] confirmation email failed', err);
  }

  return {
    meetingId: meeting.id,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt.toISOString(),
    meetLink: meeting.meetLink ?? null,
    investorTimezone,
    founderTimezone,
    investorLocalStart,
    founderLocalStart,
  };
}
