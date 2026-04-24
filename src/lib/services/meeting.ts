import { cookies } from 'next/headers';
import { eq, sql } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { meetingsRepo } from '@/lib/db/repos/meetings';
import { leads } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/mail/smtp';

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
  const now = Date.now();
  if (startsAt.getTime() < now + 60 * 60 * 1000) {
    throw new ApiError(400, 'too_soon');
  }
  if (startsAt.getTime() > now + 14 * 24 * 60 * 60 * 1000) {
    throw new ApiError(400, 'too_far_out');
  }

  const leadRow = await db.select().from(leads).where(eq(leads.id, session.leadId)).limit(1);
  const lead = leadRow[0];
  if (!lead) throw new ApiError(404, 'lead_not_found');

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

  await db
    .update(leads)
    .set({ stage: 'meeting_scheduled', stageEnteredAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, lead.id));

  await interactionsRepo.record({
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    kind: 'stage_change',
    payload: { meetingId: meeting.id, newStage: 'meeting_scheduled' },
  });

  try {
    await sendMail({
      to: session.email,
      subject: 'Your OotaOS meeting is booked',
      text: [
        'Your meeting with OotaOS is confirmed.',
        '',
        `Starts: ${startsAt.toISOString()}`,
        `Ends: ${endsAt.toISOString()}`,
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
      subject: `Meeting booked — ${session.email} — ${startsAt.toISOString()}`,
      text: [
        'A new investor meeting has been booked.',
        ``,
        `Email: ${session.email}`,
        `Start: ${startsAt.toISOString()}`,
        `End: ${endsAt.toISOString()}`,
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
  };
}
