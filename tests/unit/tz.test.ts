import { describe, expect, it } from 'vitest';

import { formatInTz, IANA_ZONES, isValidTz, slotsInTz } from '@/lib/time/tz';

describe('tz', () => {
  it('formatInTz presents the same UTC moment differently across zones', () => {
    const utc = new Date(Date.UTC(2026, 3, 24, 4, 30, 0));
    const ist = formatInTz(utc, 'Asia/Kolkata', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const awst = formatInTz(utc, 'Australia/Perth', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(ist).toContain('10:00');
    expect(awst).toContain('12:30');
  });

  it('isValidTz accepts real zones and rejects garbage', () => {
    expect(isValidTz('Asia/Kolkata')).toBe(true);
    expect(isValidTz('Europe/Paris')).toBe(true);
    expect(isValidTz('UTC')).toBe(true);
    expect(isValidTz('Mars/Olympus')).toBe(false);
    expect(isValidTz('')).toBe(false);
  });

  it('IANA_ZONES is sane and unique', () => {
    const set = new Set(IANA_ZONES);
    expect(set.size).toBe(IANA_ZONES.length);
    for (const z of IANA_ZONES) expect(isValidTz(z)).toBe(true);
  });

  it('slotsInTz returns the requested number of business-hours slots', () => {
    const mondayNoonUtc = new Date('2026-04-20T06:30:00.000Z');
    const slots = slotsInTz(mondayNoonUtc, 3, 'Asia/Kolkata');
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect(new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()).toBe(30 * 60_000);
      const hour = new Date(s.startsAt).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        hour12: false,
      });
      expect(['10', '14', '16']).toContain(hour);
    }
  });

  it('slotsInTz skips weekends by default', () => {
    const fridayEveningUtc = new Date('2026-04-24T13:00:00.000Z');
    const slots = slotsInTz(fridayEveningUtc, 4, 'Asia/Kolkata');
    for (const s of slots) {
      const weekday = new Date(s.startsAt).toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
      });
      expect(['Sat', 'Sun']).not.toContain(weekday);
    }
  });

  it('slotsInTz honours DST — spring forward in New York', () => {
    const before = new Date('2026-03-07T12:00:00.000Z');
    const slots = slotsInTz(before, 6, 'America/New_York');
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startsAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});
