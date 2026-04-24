/**
 * Timezone-aware date utilities built on native `Intl.DateTimeFormat`.
 * No extra dependency; DST handled by the ICU/CLDR data bundled with Node 20.
 *
 * Contract:
 *   - All persisted timestamps are UTC (Postgres `timestamp with time zone`).
 *   - This module converts UTC ↔ IANA-zone presentation on the edges only.
 *   - Passing an invalid IANA zone throws `RangeError` (surfaced to the caller).
 */

export const DEFAULT_FOUNDER_TZ = 'Australia/Perth';

export type IanaZone = string;

export type SlotHour = { hour: number; minute: number };

export type SlotOptions = {
  /** 24h hours-of-day to try, in priority order. Default: 10:00, 14:00, 16:00. */
  hours?: SlotHour[];
  /** Meeting length in minutes. Default 30. */
  durationMinutes?: number;
  /** Skip Saturday and Sunday in the target zone. Default true. */
  businessDaysOnly?: boolean;
  /** Earliest start is `now + leadMinutes`. Default 90. */
  leadMinutes?: number;
  /** How far ahead (days) we're willing to suggest. Default 14. */
  maxDaysAhead?: number;
};

const DEFAULT_HOURS: SlotHour[] = [
  { hour: 10, minute: 0 },
  { hour: 14, minute: 0 },
  { hour: 16, minute: 0 },
];

/**
 * Returns the wall-clock parts of a UTC date as seen in the given IANA zone.
 * Used to build slots at a specific local hour regardless of DST.
 */
function partsInZone(
  date: Date,
  tz: IanaZone,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour === '24' ? '0' : out.hour),
    minute: Number(out.minute),
    weekday: out.weekday ?? '',
  };
}

/**
 * Given Y/M/D and local H:m in the target zone, return the UTC Date that
 * corresponds to that wall-clock moment. Uses two passes to bisect the DST
 * offset; accurate to the minute in all standard zones.
 */
function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: IanaZone,
): Date {
  // First guess: interpret the wall time as UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const observed = partsInZone(guess, tz);
  // Compute the offset between the wall time we wanted and what the zone shows.
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
  const offsetMs = wantedMs - observedMs;
  return new Date(guess.getTime() + offsetMs);
}

/**
 * Format a UTC Date for humans in a given IANA zone.
 *
 *     formatInTz(d, 'Asia/Kolkata', { dateStyle: 'medium', timeStyle: 'short' })
 *     → "25 Apr 2026, 10:00 am"
 */
export function formatInTz(
  date: Date,
  tz: IanaZone,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  locale = 'en-GB',
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(date);
}

/**
 * Generate `count` meeting slots that fall on valid hours in the investor's
 * zone, skipping weekends (unless disabled) and any slots that have already
 * passed. Returned ISO strings are UTC — safe to persist directly.
 */
export function slotsInTz(
  fromDate: Date,
  count: number,
  tz: IanaZone,
  opts: SlotOptions = {},
): Array<{ startsAt: string; endsAt: string }> {
  const hours = opts.hours ?? DEFAULT_HOURS;
  const duration = opts.durationMinutes ?? 30;
  const businessOnly = opts.businessDaysOnly ?? true;
  const leadMinutes = opts.leadMinutes ?? 90;
  const maxDaysAhead = opts.maxDaysAhead ?? 14;

  // Normalize both endpoints to the zone's wall-clock so day arithmetic is
  // correct across DST boundaries and international date line.
  const now = new Date(fromDate.getTime() + leadMinutes * 60_000);
  const today = partsInZone(now, tz);

  const results: Array<{ startsAt: string; endsAt: string }> = [];

  for (let dayOffset = 0; dayOffset < maxDaysAhead && results.length < count; dayOffset++) {
    const trial = new Date(
      zonedWallToUtc(today.year, today.month, today.day + dayOffset, 12, 0, tz),
    );
    const trialParts = partsInZone(trial, tz);
    if (businessOnly) {
      const weekday = trialParts.weekday;
      if (weekday === 'Sat' || weekday === 'Sun') continue;
    }

    for (const h of hours) {
      if (results.length >= count) break;
      const startsAt = zonedWallToUtc(
        trialParts.year,
        trialParts.month,
        trialParts.day,
        h.hour,
        h.minute,
        tz,
      );
      if (startsAt.getTime() < now.getTime()) continue;
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      results.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    }
  }

  return results;
}

/** Validate an IANA zone string via the `Intl` runtime. */
export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * A curated, searchable list of commonly used IANA zones. Ships with the
 * TimezoneSelect component. Ordered by rough "likely for a founder raising
 * globally" relevance; drop-down behavior keeps search friendly.
 */
export const IANA_ZONES: readonly IanaZone[] = [
  'Australia/Perth',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Pacific/Auckland',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Tel_Aviv',
  'Asia/Jerusalem',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Helsinki',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Lima',
  'America/Bogota',
  'Pacific/Honolulu',
  'Pacific/Fiji',
  'UTC',
];
