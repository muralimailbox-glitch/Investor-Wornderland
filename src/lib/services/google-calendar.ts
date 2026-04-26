/**
 * Google Calendar integration. Optional — if no OAuth token is stored for
 * the founder, callers fall back to the synthetic meet.google.com link
 * generator we ship today. When tokens are present, this creates a real
 * Calendar event with the investor as attendee and Google Meet auto-attached.
 *
 * Token refresh is handled inline. If refresh fails (revoked / scope change),
 * we delete the row so the founder is prompted to re-authorize next time.
 */
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { googleOauthTokens } from '@/lib/db/schema';
import { env } from '@/lib/env';

export type CalendarEventInput = {
  workspaceId: string;
  founderUserId: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  attendeeEmail: string;
  attendeeName?: string;
};

export type CalendarEventResult = {
  eventId: string;
  meetLink: string;
  htmlLink: string;
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENT_INSERT_URL = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token || !j.expires_in) return null;
  return {
    accessToken: j.access_token,
    expiresAt: new Date(Date.now() + j.expires_in * 1000 - 60 * 1000),
  };
}

/**
 * Returns null when no token exists (caller should fall back). Throws on
 * Google API failures so the caller can surface the error.
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarEventResult | null> {
  const [tok] = await db
    .select()
    .from(googleOauthTokens)
    .where(
      and(
        eq(googleOauthTokens.workspaceId, input.workspaceId),
        eq(googleOauthTokens.userId, input.founderUserId),
      ),
    )
    .limit(1);
  if (!tok) return null;

  let accessToken = tok.accessToken;
  if (tok.expiresAt.getTime() <= Date.now()) {
    if (!tok.refreshToken) return null;
    const refreshed = await refreshAccessToken(tok.refreshToken);
    if (!refreshed) {
      // Token unrecoverable — drop the row so the founder gets re-prompted.
      await db
        .delete(googleOauthTokens)
        .where(eq(googleOauthTokens.id, tok.id))
        .catch(() => {});
      return null;
    }
    accessToken = refreshed.accessToken;
    await db
      .update(googleOauthTokens)
      .set({ accessToken, expiresAt: refreshed.expiresAt, updatedAt: new Date() })
      .where(eq(googleOauthTokens.id, tok.id));
  }

  const eventBody = {
    summary: input.summary,
    description: input.description ?? '',
    start: { dateTime: input.startsAt.toISOString() },
    end: { dateTime: input.endsAt.toISOString() },
    attendees: [
      { email: input.attendeeEmail, displayName: input.attendeeName ?? input.attendeeEmail },
    ],
    conferenceData: {
      createRequest: {
        requestId: `ootaos-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: { useDefault: true },
  };

  const res = await fetch(EVENT_INSERT_URL(tok.calendarId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`google_calendar_insert_failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const event = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    htmlLink?: string;
    conferenceData?: { entryPoints?: Array<{ uri?: string }> };
  };

  const meetLink = event.hangoutLink ?? event.conferenceData?.entryPoints?.[0]?.uri ?? '';
  if (!event.id || !meetLink) {
    throw new Error('google_calendar_no_event_or_meet_link');
  }
  return { eventId: event.id, meetLink, htmlLink: event.htmlLink ?? '' };
}

/**
 * Best-effort delete on cancellation. Failures are logged — the local row
 * is already gone, so we don't want to fail user-facing flows on Google issues.
 */
export async function deleteCalendarEvent(input: {
  workspaceId: string;
  founderUserId: string;
  eventId: string;
}): Promise<void> {
  const [tok] = await db
    .select()
    .from(googleOauthTokens)
    .where(
      and(
        eq(googleOauthTokens.workspaceId, input.workspaceId),
        eq(googleOauthTokens.userId, input.founderUserId),
      ),
    )
    .limit(1);
  if (!tok) return;

  let accessToken = tok.accessToken;
  if (tok.expiresAt.getTime() <= Date.now() && tok.refreshToken) {
    const refreshed = await refreshAccessToken(tok.refreshToken);
    if (!refreshed) return;
    accessToken = refreshed.accessToken;
  }

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tok.calendarId)}/events/${encodeURIComponent(input.eventId)}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  ).catch((err) => {
    console.warn('[google-calendar] delete failed', err);
  });
}
