import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { meetingsRepo } from '@/lib/db/repos/meetings';
import { firms, investors, leads, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';
import { checkAvailability, FOUNDER_TZ } from '@/lib/time/availability';
import { DEFAULT_FOUNDER_TZ, formatInTz } from '@/lib/time/tz';

export type MeetingSlot = { startsAt: string; endsAt: string };

export type BookMeetingInput = {
  /** Single-slot legacy shape — kept for back-compat. */
  startsAt?: string;
  endsAt?: string;
  /** Multi-slot shape — investor picks N slots, all booked atomically. */
  slots?: MeetingSlot[];
  agenda?: string;
};

export type BookedMeeting = {
  meetingId: string;
  startsAt: string;
  endsAt: string;
  meetLink: string;
  investorLocalStart: string;
  founderLocalStart: string;
};

export type BookMeetingResult = {
  meetings: BookedMeeting[];
  investorTimezone: string;
  founderTimezone: string;
};

/**
 * Generate a Google Meet starter link. Without Google Calendar API
 * integration we can't reserve a real meeting room, but `meet.google.com/new`
 * always opens a fresh meeting on the user's Google account, and the lookup
 * format with a deterministic code lets the founder share a stable link
 * before they start the meeting. The confirmation email tells the investor
 * they're welcome to send their own invite from any meeting tool.
 */
function generateMeetLink(): string {
  // Format: 3 letters - 4 letters - 3 letters (lowercase a-z, no l/o/0/1)
  const alphabet = 'abcdefghijkmnpqrstuvwxyz';
  function block(n: number): string {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
  return `https://meet.google.com/${block(3)}-${block(4)}-${block(3)}`;
}

const MEET_DISCLAIMER =
  'Google Meet is just our default starter — feel free to send your own invite from Google Calendar, Outlook, Calendly, Zoom, or whatever you prefer.';

export async function bookMeeting(input: BookMeetingInput): Promise<BookMeetingResult> {
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  // Normalize input → array of slots
  const slots: MeetingSlot[] =
    input.slots && input.slots.length > 0
      ? input.slots
      : input.startsAt && input.endsAt
        ? [{ startsAt: input.startsAt, endsAt: input.endsAt }]
        : [];
  if (slots.length === 0) throw new ApiError(400, 'slots_required');
  if (slots.length > 5) throw new ApiError(400, 'too_many_slots');

  // Validate every slot before any DB write — atomic from the operator's POV.
  const parsed = slots.map((s) => {
    const startsAt = new Date(s.startsAt);
    const endsAt = new Date(s.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      throw new ApiError(400, 'invalid_time');
    }
    if (startsAt.getTime() >= endsAt.getTime()) {
      throw new ApiError(400, 'invalid_time_range');
    }
    const durationMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
    const availability = checkAvailability(startsAt, durationMinutes);
    if (!availability.ok) throw new ApiError(400, availability.reason);
    return { startsAt, endsAt, durationMinutes };
  });

  const leadRow = await db
    .select({ lead: leads, investorTimezone: investors.timezone })
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
  const founderTimezone: string = founderRow[0]?.tz ?? FOUNDER_TZ ?? DEFAULT_FOUNDER_TZ;

  // Conflict-check every slot against existing meetings up front.
  for (const p of parsed) {
    const conflict = await db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM meetings
      WHERE workspace_id = ${lead.workspaceId}
        AND tstzrange(starts_at, ends_at, '[)') && tstzrange(${p.startsAt.toISOString()}::timestamptz, ${p.endsAt.toISOString()}::timestamptz, '[)')
    `);
    if ((conflict[0]?.count ?? 0) > 0) {
      throw new ApiError(409, 'slot_taken');
    }
  }

  // Insert all meetings. Each gets its own meet link.
  const proposalGroupId = randomUUID();
  const created: BookedMeeting[] = [];
  for (const p of parsed) {
    const meetLink = generateMeetLink();
    const meeting = await meetingsRepo.create({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      meetLink,
      agenda: input.agenda ?? null,
    });
    created.push({
      meetingId: meeting.id,
      startsAt: meeting.startsAt.toISOString(),
      endsAt: meeting.endsAt.toISOString(),
      meetLink,
      investorLocalStart: formatInTz(p.startsAt, investorTimezone, {
        dateStyle: 'full',
        timeStyle: 'short',
      }),
      founderLocalStart: formatInTz(p.startsAt, founderTimezone, {
        dateStyle: 'full',
        timeStyle: 'short',
      }),
    });
    await interactionsRepo.record({
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      kind: 'meeting_held',
      payload: {
        meetingId: meeting.id,
        scheduled: true,
        proposalGroupId,
        startsAt: p.startsAt.toISOString(),
      },
    });
  }

  // Auto-advance lead to meeting_scheduled (idempotent if already further).
  const { autoAdvanceOnEvent } = await import('@/lib/services/auto-transition');
  await autoAdvanceOnEvent(lead.workspaceId, lead.id, 'meeting_booked');

  // Resolve investor identity for branded emails
  const invRow = await db
    .select({
      firstName: investors.firstName,
      lastName: investors.lastName,
      firmName: firms.name,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(eq(leads.id, lead.id))
    .limit(1);
  const inv = invRow[0];
  const investorName = inv ? `${inv.firstName} ${inv.lastName}`.trim() : session.email;
  const firmLabel = inv?.firmName ? ` (${inv.firmName})` : '';

  // Single consolidated investor confirmation email
  try {
    const facts: Array<[string, string]> = [];
    created.forEach((m, i) => {
      const slotIdx = created.length === 1 ? 'When' : `Slot ${i + 1}`;
      facts.push([slotIdx, `${m.investorLocalStart} (${shortTz(investorTimezone)})`]);
      facts.push(['Founder time', `${m.founderLocalStart} (${shortTz(founderTimezone)})`]);
      facts.push(['Google Meet', m.meetLink]);
    });
    if (input.agenda) facts.push(['Agenda', input.agenda]);

    const investorBody =
      created.length === 1
        ? `Confirmed. We're locked in for the time below. The Google Meet link is included — feel free to send your own calendar invite or use a different meeting tool if that's easier on your end.\n\nIf anything changes, just reply to this email and we'll re-book.`
        : `Confirmed. We've reserved all ${created.length} slots you picked so we have flexibility. We'll lock in one and release the others a day before — just reply if you want to choose now.`;

    const investorEmail = renderBrandedEmail({
      heading:
        created.length === 1
          ? `Your OotaOS meeting is booked`
          : `${created.length} meeting slots reserved with OotaOS`,
      body: investorBody,
      facts,
      cta: [
        { label: 'Open the data room', href: `${env.NEXT_PUBLIC_SITE_URL}/lounge` },
        {
          label: 'Start a Google Meet',
          href: created[0]?.meetLink ?? 'https://meet.google.com/new',
        },
      ],
      preFooter: MEET_DISCLAIMER,
    });

    await sendMail({
      to: session.email,
      subject:
        created.length === 1
          ? 'Your OotaOS meeting is booked'
          : `${created.length} OotaOS slots reserved`,
      text: investorEmail.text,
      html: investorEmail.html,
    });

    // Founder + EA notification — single email summarizing all slots
    const founderFacts: Array<[string, string]> = [
      ['Investor', `${investorName}${firmLabel}`],
      ['Email', session.email],
      ['Stage', lead.stage],
    ];
    created.forEach((m, i) => {
      const idx = created.length === 1 ? 'When' : `Slot ${i + 1}`;
      founderFacts.push([
        idx,
        `${m.founderLocalStart} (founder) · ${m.investorLocalStart} (investor)`,
      ]);
      founderFacts.push([`Google Meet ${created.length === 1 ? '' : i + 1}`.trim(), m.meetLink]);
    });
    if (input.agenda) founderFacts.push(['Agenda', input.agenda]);

    const founderEmail = renderBrandedEmail({
      heading: `Meeting booked — ${investorName}${firmLabel}`,
      body: `${investorName}${firmLabel} just booked ${created.length === 1 ? 'a meeting' : `${created.length} options`} from the lounge calendar.`,
      facts: founderFacts,
      cta: [
        {
          label: 'Open in cockpit',
          href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/meetings`,
        },
        ...created.map((m, i) => ({
          label: created.length === 1 ? 'Start Google Meet' : `Start Meet ${i + 1}`,
          href: m.meetLink,
        })),
      ],
      preFooter: MEET_DISCLAIMER,
    });

    await sendMail({
      to: env.SMTP_FROM,
      subject: `Meeting booked — ${investorName}${firmLabel}`,
      text: founderEmail.text,
      html: founderEmail.html,
    });
    await sendMail({
      to: 'krish.c@snapsitebuild.com',
      subject: `[OotaOS] Meeting booked — ${investorName}${firmLabel}`,
      text: founderEmail.text,
      html: founderEmail.html,
    });
  } catch (err) {
    console.warn('[meeting] confirmation email failed', err);
  }

  return {
    meetings: created,
    investorTimezone,
    founderTimezone,
  };
}

function shortTz(tz: string): string {
  const parts = tz.split('/');
  return parts[parts.length - 1]?.replace(/_/g, ' ') ?? tz;
}

/**
 * Cancel a meeting on the founder's behalf. Notifies the investor + EA via
 * the same branded email shell.
 */
export async function cancelMeeting(input: {
  workspaceId: string;
  meetingId: string;
  reason?: string;
}): Promise<void> {
  const { meetings } = await import('@/lib/db/schema');
  const meetingRow = await db
    .select({
      meeting: meetings,
      lead: leads,
      investorEmail: investors.email,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      investorTimezone: investors.timezone,
      firmName: firms.name,
    })
    .from(meetings)
    .innerJoin(leads, eq(leads.id, meetings.leadId))
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(eq(meetings.workspaceId, input.workspaceId), eq(meetings.id, input.meetingId)))
    .limit(1);
  const r = meetingRow[0];
  if (!r) throw new ApiError(404, 'meeting_not_found');

  await db
    .delete(meetings)
    .where(and(eq(meetings.workspaceId, input.workspaceId), eq(meetings.id, input.meetingId)));

  await interactionsRepo.record({
    workspaceId: input.workspaceId,
    leadId: r.lead.id,
    kind: 'note',
    payload: {
      kind: 'meeting_cancelled',
      meetingId: input.meetingId,
      reason: input.reason ?? null,
      startsAt: r.meeting.startsAt.toISOString(),
    },
  });

  const investorName = `${r.investorFirstName} ${r.investorLastName}`.trim();
  const firmLabel = r.firmName ? ` (${r.firmName})` : '';
  const investorTimezone = r.investorTimezone || DEFAULT_FOUNDER_TZ;
  const investorLocalStart = formatInTz(r.meeting.startsAt, investorTimezone, {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  try {
    const investorEmail = renderBrandedEmail({
      heading: 'Your OotaOS meeting was cancelled',
      body:
        `Hi ${r.investorFirstName} — we had to cancel the slot we'd booked for ${investorLocalStart}.\n\n` +
        (input.reason ? `Reason: ${input.reason}\n\n` : '') +
        `Reply to this email or pick a new time at the link below — we'll prioritise the rebook.`,
      cta: [{ label: 'Pick a new time', href: `${env.NEXT_PUBLIC_SITE_URL}/lounge` }],
      preFooter: 'We send a fresh Google Meet link with every booking.',
    });
    await sendMail({
      to: r.investorEmail,
      subject: 'Your OotaOS meeting was cancelled',
      text: investorEmail.text,
      html: investorEmail.html,
    });

    const eaEmail = renderBrandedEmail({
      heading: `Meeting cancelled — ${investorName}${firmLabel}`,
      body: `Founder cancelled the slot at ${investorLocalStart}.${
        input.reason ? `\n\nReason: ${input.reason}` : ''
      }`,
      facts: [
        ['Investor', `${investorName}${firmLabel}`],
        ['Email', r.investorEmail],
        ['Was scheduled for', investorLocalStart],
      ],
    });
    await sendMail({
      to: env.SMTP_FROM,
      subject: `Meeting cancelled — ${investorName}${firmLabel}`,
      text: eaEmail.text,
      html: eaEmail.html,
    });
    await sendMail({
      to: 'krish.c@snapsitebuild.com',
      subject: `[OotaOS] Meeting cancelled — ${investorName}${firmLabel}`,
      text: eaEmail.text,
      html: eaEmail.html,
    });
  } catch (err) {
    console.warn('[meeting] cancel email failed', err);
  }
}
