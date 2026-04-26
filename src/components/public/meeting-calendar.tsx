'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

type Slot = { startsAt: string; endsAt: string; istLabel: string; taken: boolean };

type Props = {
  investorTimezone: string;
  founderTimezone: string;
  onBooked?: (slot: Slot) => void;
};

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shortTz(tz: string): string {
  const parts = tz.split('/');
  return parts[parts.length - 1]?.replace(/_/g, ' ') ?? tz;
}

function startOfWeekUtc(d: Date): Date {
  const local = new Date(d);
  const day = local.getDay(); // 0=Sun
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - day);
  return local;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function formatDateHeader(d: Date, tz: string): { weekday: string; date: string } {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(d);
  const weekday =
    fmt.find((p) => p.type === 'weekday')?.value ?? DAY_LABEL[d.getDay()] ?? '';
  const day = fmt.find((p) => p.type === 'day')?.value ?? '';
  const month = fmt.find((p) => p.type === 'month')?.value ?? '';
  return { weekday, date: `${day} ${month}` };
}

export function MeetingCalendar({ investorTimezone, founderTimezone, onBooked }: Props) {
  // Anchor each "page" to a UTC week-start (Sunday 00:00 local).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekUtc(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookedId, setBookedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setSlots(null);
      setError(null);
      const params = new URLSearchParams({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      });
      fetch(`/api/v1/meeting/slots?${params}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as { slots: Slot[] };
        })
        .then((j) => {
          if (alive) setSlots(j.slots);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        });
    });
    return () => {
      alive = false;
    };
  }, [weekStart, weekEnd]);

  // Group slots by IST date so the columns align with the founder's working day.
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    if (!slots) return map;
    for (const s of slots) {
      const istKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: founderTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(s.startsAt));
      const list = map.get(istKey) ?? [];
      list.push(s);
      map.set(istKey, list);
    }
    return map;
  }, [slots, founderTimezone]);

  // Build the 7-day column array (IST keys) in week order
  const dayColumns = useMemo(() => {
    const cols: Array<{ key: string; date: Date }> = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const key = new Intl.DateTimeFormat('en-CA', {
        timeZone: founderTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      cols.push({ key, date: d });
    }
    return cols;
  }, [weekStart, founderTimezone]);

  async function book(slot: Slot) {
    setBookingId(slot.startsAt);
    setError(null);
    try {
      const res = await fetch('/api/v1/meeting/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ startsAt: slot.startsAt, endsAt: slot.endsAt }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setBookedId(slot.startsAt);
      onBooked?.(slot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'booking failed');
    } finally {
      setBookingId(null);
    }
  }

  const canGoBack = weekStart > today;
  const monthLabel = weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-5 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700">
            Founder calendar
          </p>
          <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
          <p className="text-[11px] text-slate-500">
            Slots in your time ({shortTz(investorTimezone)}). Founder is in IST. Mon–Sat,
            9–12 and 1:30–7 IST.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            disabled={!canGoBack}
            className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeekUtc(new Date()))}
            className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-50"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {slots === null ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading slots…
        </div>
      ) : (
        <div className="grid grid-cols-7 divide-x divide-slate-100">
          {dayColumns.map((col) => {
            const slotsForDay = byDay.get(col.key) ?? [];
            const header = formatDateHeader(col.date, founderTimezone);
            const isPast = col.date < today;
            return (
              <div
                key={col.key}
                className={`flex min-h-[260px] flex-col ${isPast ? 'opacity-50' : ''}`}
              >
                <div className="border-b border-slate-100 bg-slate-50 px-2 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {header.weekday}
                  </p>
                  <p className="text-sm font-medium text-slate-800">{header.date}</p>
                </div>
                <div className="flex flex-1 flex-col gap-1 px-1.5 py-2">
                  {slotsForDay.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[10px] text-slate-300">
                      —
                    </div>
                  ) : (
                    slotsForDay.map((s) => {
                      const booked = bookedId === s.startsAt || s.taken;
                      const busy = bookingId === s.startsAt;
                      return (
                        <button
                          key={s.startsAt}
                          type="button"
                          disabled={booked || busy || s.taken}
                          onClick={() => void book(s)}
                          className={`rounded-lg px-1.5 py-1 text-[11px] font-medium transition ${
                            booked
                              ? 'cursor-default border border-emerald-300 bg-emerald-50 text-emerald-800'
                              : s.taken
                                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 line-through'
                                : 'border border-orange-200 bg-white text-slate-700 hover:-translate-y-px hover:border-orange-400 hover:bg-orange-50'
                          }`}
                          title={`Founder time: ${s.istLabel} IST`}
                        >
                          {busy ? (
                            <Loader2 className="mx-auto h-3 w-3 animate-spin" />
                          ) : booked ? (
                            <span className="flex items-center justify-center gap-1">
                              <CalendarCheck className="h-3 w-3" /> Booked
                            </span>
                          ) : (
                            formatTime(s.startsAt, investorTimezone)
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
