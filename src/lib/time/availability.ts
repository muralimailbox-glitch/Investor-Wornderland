/**
 * Founder availability rules for OotaOS investor meetings.
 *
 * Founder timezone: Asia/Kolkata (UTC+5:30, no DST).
 * Bookable hours, Monday–Saturday only:
 *   • 09:00 – 12:00 IST  (post-breakfast morning block)
 *   • 13:30 – 19:00 IST  (post-lunch afternoon block)
 * Standing breaks (excluded):
 *   • 08:00 – 09:00 IST  (breakfast)
 *   • 12:00 – 13:30 IST  (lunch)
 *   • 19:00 – 20:00 IST  (dinner)
 * Minimum advance notice: 20 hours from now.
 * Maximum lead: 14 days from now.
 *
 * The investor picks a slot rendered in their local zone; the server
 * validates the underlying UTC instant against IST wall-clock here.
 */
import { DEFAULT_FOUNDER_TZ, formatInTz } from '@/lib/time/tz';

export const FOUNDER_TZ = DEFAULT_FOUNDER_TZ; // 'Asia/Kolkata'
export const MIN_NOTICE_HOURS = 20;
export const MAX_LEAD_DAYS = 14;
export const DEFAULT_DURATION_MINUTES = 30;

/** Minute-of-day windows when the founder can take meetings. */
export const FOUNDER_WINDOWS: Array<{ startMin: number; endMin: number; label: string }> = [
  { startMin: 9 * 60, endMin: 12 * 60, label: 'morning' },
  { startMin: 13 * 60 + 30, endMin: 19 * 60, label: 'afternoon' },
];

/** Days the founder takes meetings on (in IST wall-clock). 0 = Sun, 6 = Sat. */
export const FOUNDER_WORKING_DAYS = new Set([1, 2, 3, 4, 5, 6]); // Mon–Sat

type IstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 Sun .. 6 Sat
};

function partsInIst(date: Date): IstParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FOUNDER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  const wkMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour === '24' ? '0' : out.hour),
    minute: Number(out.minute),
    weekday: wkMap[out.weekday ?? 'Mon'] ?? 1,
  };
}

function istWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // IST has no DST; offset is always +05:30. Bisect via observation in case
  // the runtime's ICU disagrees on edge dates.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const observed = partsInIst(guess);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const observedMs = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
    0,
    0,
  );
  return new Date(guess.getTime() + (wantedMs - observedMs));
}

export type AvailabilityCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'too_soon' | 'too_far_out' | 'outside_hours' | 'weekend' | 'crosses_break';
    };

/**
 * Validate that a proposed meeting (UTC start + duration) lands inside a
 * founder-available IST window with sufficient notice. Returns a structured
 * reason on failure so the caller can produce specific error messages.
 */
export function checkAvailability(
  startsAtUtc: Date,
  durationMinutes: number = DEFAULT_DURATION_MINUTES,
  now: Date = new Date(),
): AvailabilityCheck {
  const minLeadMs = MIN_NOTICE_HOURS * 60 * 60 * 1000;
  const maxLeadMs = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;
  if (startsAtUtc.getTime() < now.getTime() + minLeadMs) {
    return { ok: false, reason: 'too_soon' };
  }
  if (startsAtUtc.getTime() > now.getTime() + maxLeadMs) {
    return { ok: false, reason: 'too_far_out' };
  }
  const ist = partsInIst(startsAtUtc);
  if (!FOUNDER_WORKING_DAYS.has(ist.weekday)) {
    return { ok: false, reason: 'weekend' };
  }
  const startMin = ist.hour * 60 + ist.minute;
  const endMin = startMin + durationMinutes;

  const window = FOUNDER_WINDOWS.find((w) => startMin >= w.startMin && startMin < w.endMin);
  if (!window) return { ok: false, reason: 'outside_hours' };
  if (endMin > window.endMin) return { ok: false, reason: 'crosses_break' };

  return { ok: true };
}

/**
 * Generate slot start times within an explicit UTC range, spaced at
 * `stepMinutes` granularity within the founder's working windows. Used by
 * the calendar to fetch one week at a time. Honors the 20-hour minimum
 * notice and 14-day max lead — slots earlier than now+notice or later
 * than now+max are filtered out.
 */
export function generateBookableSlotsInRange(
  fromUtc: Date,
  toUtc: Date,
  durationMinutes: number = DEFAULT_DURATION_MINUTES,
  stepMinutes: number = 30,
  now: Date = new Date(),
): Array<{ startsAt: string; endsAt: string; istLabel: string }> {
  const out: Array<{ startsAt: string; endsAt: string; istLabel: string }> = [];
  const minLeadMs = MIN_NOTICE_HOURS * 60 * 60 * 1000;
  const maxLeadMs = MAX_LEAD_DAYS * 24 * 60 * 60 * 1000;
  const earliest = new Date(Math.max(now.getTime() + minLeadMs, fromUtc.getTime()));
  const latest = new Date(Math.min(now.getTime() + maxLeadMs, toUtc.getTime()));
  if (earliest >= latest) return out;

  const startIst = partsInIst(earliest);
  const endIst = partsInIst(latest);
  // walk day by day in IST so DST-free arithmetic stays clean
  const startKey = startIst.year * 10000 + startIst.month * 100 + startIst.day;
  const endKey = endIst.year * 10000 + endIst.month * 100 + endIst.day;
  for (let dayOffset = 0; dayOffset < MAX_LEAD_DAYS + 7; dayOffset++) {
    const trial = istWallToUtc(startIst.year, startIst.month, startIst.day + dayOffset, 0, 0);
    const ist = partsInIst(trial);
    const key = ist.year * 10000 + ist.month * 100 + ist.day;
    if (key < startKey) continue;
    if (key > endKey) break;
    if (!FOUNDER_WORKING_DAYS.has(ist.weekday)) continue;

    for (const window of FOUNDER_WINDOWS) {
      for (let m = window.startMin; m + durationMinutes <= window.endMin; m += stepMinutes) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        const startsAt = istWallToUtc(ist.year, ist.month, ist.day, h, min);
        if (startsAt.getTime() < earliest.getTime()) continue;
        if (startsAt.getTime() > latest.getTime()) continue;
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
        out.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          istLabel: formatInTz(startsAt, FOUNDER_TZ, {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        });
      }
    }
  }
  return out;
}

/**
 * Generate the full set of bookable slot start times (UTC ISO strings),
 * spaced at `stepMinutes` granularity within the founder's working windows,
 * for the next `MAX_LEAD_DAYS` days starting from `MIN_NOTICE_HOURS` ahead.
 */
export function generateBookableSlots(
  durationMinutes: number = DEFAULT_DURATION_MINUTES,
  stepMinutes: number = 30,
  now: Date = new Date(),
): Array<{ startsAt: string; endsAt: string; istLabel: string }> {
  const out: Array<{ startsAt: string; endsAt: string; istLabel: string }> = [];
  const minLeadMs = MIN_NOTICE_HOURS * 60 * 60 * 1000;
  const earliest = new Date(now.getTime() + minLeadMs);
  const earliestIst = partsInIst(earliest);

  for (let dayOffset = 0; dayOffset < MAX_LEAD_DAYS; dayOffset++) {
    const trial = istWallToUtc(
      earliestIst.year,
      earliestIst.month,
      earliestIst.day + dayOffset,
      0,
      0,
    );
    const ist = partsInIst(trial);
    if (!FOUNDER_WORKING_DAYS.has(ist.weekday)) continue;

    for (const window of FOUNDER_WINDOWS) {
      for (let m = window.startMin; m + durationMinutes <= window.endMin; m += stepMinutes) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        const startsAt = istWallToUtc(ist.year, ist.month, ist.day, h, min);
        if (startsAt.getTime() < earliest.getTime()) continue;
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
        out.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          istLabel: formatInTz(startsAt, FOUNDER_TZ, {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        });
      }
    }
  }
  return out;
}
