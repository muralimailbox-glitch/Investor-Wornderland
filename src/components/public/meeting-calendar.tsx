'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

type Slot = { startsAt: string; endsAt: string; istLabel: string; taken: boolean };

type Props = {
  investorTimezone: string;
  founderTimezone: string;
  onBooked?: (slots: Slot[]) => void;
};

const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_SLOTS = 5;
/**
 * Default view shows only this many curated slots, never the full calendar
 * grid. Spreading "your calendar is wide open" across seven columns reads as
 * low-signal availability; the founder explicitly asked for a tighter view
 * that protects perceived priority. Investors can click "See more times" if
 * none of the offered picks work — at which point the full grid is revealed.
 */
const CURATED_SLOT_COUNT = 4;

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

function formatDateLong(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekUtc(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Selected slots persist across weeks via Map keyed by startsAt ISO.
  const [selected, setSelected] = useState<Map<string, Slot>>(() => new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [bookedKeys, setBookedKeys] = useState<Set<string>>(() => new Set());
  // Default to the curated 4-slot strip; full grid revealed on demand only.
  const [showAllSlots, setShowAllSlots] = useState(false);
  // Stable mount-time "now" for filtering past slots — bare Date.now() in a
  // useMemo trips react-hooks/purity. Mount-stable is fine here since we
  // re-fetch slots whenever the visible week changes.
  const [nowMs] = useState(() => Date.now());

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

  /**
   * Pick CURATED_SLOT_COUNT slots that look "intentionally offered to you"
   * rather than "the founder is free all week". Strategy: walk the
   * available (untaken, future) slots in chronological order, take at most
   * one slot per day, and stop once we have CURATED_SLOT_COUNT. That
   * spreads the picks across distinct days so the investor sees variety
   * without exposing the underlying density.
   */
  const curatedSlots = useMemo<Slot[]>(() => {
    if (!slots) return [];
    const seenDays = new Set<string>();
    const picks: Slot[] = [];
    for (const s of slots) {
      if (s.taken) continue;
      if (bookedKeys.has(s.startsAt)) continue;
      if (new Date(s.startsAt).getTime() < nowMs) continue;
      const dayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: founderTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(s.startsAt));
      if (seenDays.has(dayKey)) continue;
      seenDays.add(dayKey);
      picks.push(s);
      if (picks.length >= CURATED_SLOT_COUNT) break;
    }
    return picks;
  }, [slots, founderTimezone, bookedKeys, nowMs]);

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

  function toggleSlot(s: Slot) {
    if (s.taken || bookedKeys.has(s.startsAt)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(s.startsAt)) {
        next.delete(s.startsAt);
      } else {
        if (next.size >= MAX_SLOTS) return next;
        next.set(s.startsAt, s);
      }
      return next;
    });
  }

  const selectedList = useMemo(
    () =>
      [...selected.values()].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    [selected],
  );

  async function confirm() {
    if (selectedList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/meeting/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slots: selectedList.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
          ...(agenda.trim() ? { agenda: agenda.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      const justBooked = new Set(selectedList.map((s) => s.startsAt));
      setBookedKeys((prev) => new Set([...prev, ...justBooked]));
      onBooked?.(selectedList);
      setSelected(new Map());
      setConfirmOpen(false);
      setAgenda('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'booking failed');
    } finally {
      setBusy(false);
    }
  }

  const canGoBack = weekStart > today;
  const monthLabel = weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const justBookedAll = bookedKeys.size > 0 && selected.size === 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-5 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700">
            {showAllSlots ? 'Founder calendar' : 'Held for you'}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {showAllSlots ? monthLabel : 'A few times we can prioritise for you'}
          </p>
          <p className="text-[11px] text-slate-500">
            {showAllSlots
              ? `Slots in your time (${shortTz(investorTimezone)}). Founder time in IST. Pick up to ${MAX_SLOTS} options.`
              : `Times in your zone (${shortTz(investorTimezone)}). Investor calls are the priority Krish's week is built around.`}
          </p>
        </div>
        {showAllSlots ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAllSlots(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              title="Back to the suggested picks"
            >
              ← Picks
            </button>
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
        ) : null}
      </header>

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {justBookedAll ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">
          <CalendarCheck className="mr-1 inline h-3.5 w-3.5" /> Confirmation sent. Check your inbox
          for the Google Meet link.
        </div>
      ) : null}

      {slots === null ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading slots…
        </div>
      ) : !showAllSlots ? (
        <div className="px-5 py-5">
          {curatedSlots.length === 0 ? (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-5 text-center text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                No held slots in this window.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Open the full view below or reply to your invite email — we&apos;ll make a
                custom slot for you.
              </p>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {curatedSlots.map((s) => {
                const isSelected = selected.has(s.startsAt);
                const booked = bookedKeys.has(s.startsAt);
                return (
                  <li key={s.startsAt}>
                    <button
                      type="button"
                      onClick={() => toggleSlot(s)}
                      disabled={booked}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        booked
                          ? 'cursor-default border-emerald-300 bg-emerald-50 text-emerald-800'
                          : isSelected
                            ? 'border-transparent bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white shadow-md'
                            : 'border-orange-200 bg-white text-slate-900 hover:-translate-y-px hover:border-orange-400 hover:shadow-md'
                      }`}
                    >
                      <div>
                        <p
                          className={`text-xs font-semibold uppercase tracking-[0.12em] ${
                            isSelected ? 'text-white/80' : 'text-orange-700'
                          }`}
                        >
                          {formatDateLong(s.startsAt, investorTimezone)}
                        </p>
                        <p className="mt-0.5 text-base font-semibold">
                          {formatTime(s.startsAt, investorTimezone)}
                        </p>
                        <p
                          className={`text-[11px] ${
                            isSelected ? 'text-white/80' : 'text-slate-500'
                          }`}
                        >
                          Founder time: {s.istLabel} IST
                        </p>
                      </div>
                      {booked ? (
                        <CalendarCheck className="h-5 w-5 flex-none" />
                      ) : isSelected ? (
                        <Sparkles className="h-5 w-5 flex-none" />
                      ) : (
                        <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700 group-hover:bg-orange-100">
                          Pick
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowAllSlots(true)}
              className="text-[12px] font-medium text-slate-500 underline-offset-4 transition hover:text-orange-700 hover:underline"
            >
              None of these work? See more times.
            </button>
          </div>
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
                      const booked = bookedKeys.has(s.startsAt);
                      const isSelected = selected.has(s.startsAt);
                      const taken = s.taken;
                      return (
                        <button
                          key={s.startsAt}
                          type="button"
                          disabled={taken || booked}
                          onClick={() => toggleSlot(s)}
                          className={`group rounded-lg px-1.5 py-1 text-[11px] font-medium transition ${
                            booked
                              ? 'cursor-default border border-emerald-300 bg-emerald-50 text-emerald-800'
                              : taken
                                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 line-through'
                                : isSelected
                                  ? 'border border-transparent bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white shadow-sm'
                                  : 'border border-orange-200 bg-white text-slate-700 hover:-translate-y-px hover:border-orange-400 hover:bg-orange-50'
                          }`}
                          title={`Founder time: ${s.istLabel} IST`}
                        >
                          {booked ? (
                            <span className="flex items-center justify-center gap-1">
                              <CalendarCheck className="h-3 w-3" /> Booked
                            </span>
                          ) : isSelected ? (
                            <span className="flex items-center justify-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              {formatTime(s.startsAt, investorTimezone)}
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

      {selected.size > 0 ? (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-orange-100 bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">
              {selected.size} slot{selected.size === 1 ? '' : 's'} selected
            </span>
            <span className="text-slate-500">— review &amp; confirm to send the invite.</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md"
            >
              Review &amp; confirm →
            </button>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Confirm your meeting picks</p>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-xs text-slate-500">
                We&apos;ll email you a confirmation with a Google Meet link for each pick. You can
                send your own invite from any meeting tool — Google Meet is just our default.
              </p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/50">
                {selectedList.map((s) => (
                  <li key={s.startsAt} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDateLong(s.startsAt, investorTimezone)} ·{' '}
                        {formatTime(s.startsAt, investorTimezone)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Founder: {s.istLabel} IST
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSlot(s)}
                      className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Remove slot"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Anything you&apos;d like to cover? (optional)
                </span>
                <textarea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Round mechanics, GTM in Sydney, founder background"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending invite…
                  </>
                ) : (
                  <>Confirm &amp; send invite</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
