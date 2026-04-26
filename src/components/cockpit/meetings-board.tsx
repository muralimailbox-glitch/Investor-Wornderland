'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CalendarOff,
  CalendarRange,
  Loader2,
  Mail,
  RefreshCw,
  Video,
  X,
} from 'lucide-react';

type MeetingRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  meetLink: string | null;
  agenda: string | null;
  preBrief: string | null;
  postNotes: string | null;
  leadId: string;
  stage: string;
  investor: { firstName: string; lastName: string; email: string };
  firmName: string | null;
};

type Scope = 'upcoming' | 'all';

const TZ_LABELS: Array<{ tz: string; label: string }> = [
  { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, label: 'Local' },
  { tz: 'Asia/Kolkata', label: 'IST' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
];

function formatIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function startGroupKey(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function MeetingsBoard() {
  const [scope, setScope] = useState<Scope>('upcoming');
  const [rows, setRows] = useState<MeetingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState<MeetingRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState<MeetingRow | null>(null);
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleDuration, setRescheduleDuration] = useState(30);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  async function load(s: Scope) {
    setRows(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/meetings?scope=${s}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { meetings: MeetingRow[] };
      setRows(j.meetings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load meetings');
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load(scope);
    });
  }, [scope]);

  const grouped = useMemo(() => {
    if (!rows) return [] as Array<{ key: string; rows: MeetingRow[] }>;
    const map = new Map<string, MeetingRow[]>();
    for (const r of rows) {
      const k = startGroupKey(r.startsAt);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, list]) => ({ key, rows: list }));
  }, [rows]);

  async function confirmReschedule() {
    if (!rescheduleOpen) return;
    if (!rescheduleStart) {
      setError('Pick a new start time.');
      return;
    }
    setReschedulingId(rescheduleOpen.id);
    setError(null);
    try {
      const start = new Date(rescheduleStart);
      const end = new Date(start.getTime() + rescheduleDuration * 60_000);
      const res = await fetch(`/api/v1/admin/meetings/${rescheduleOpen.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          newStartsAt: start.toISOString(),
          newEndsAt: end.toISOString(),
          ...(rescheduleReason.trim() ? { reason: rescheduleReason.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setRescheduleOpen(null);
      setRescheduleStart('');
      setRescheduleReason('');
      setRescheduleDuration(30);
      await load(scope);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reschedule failed');
    } finally {
      setReschedulingId(null);
    }
  }

  async function confirmCancel() {
    if (!cancelOpen) return;
    const m = cancelOpen;
    setCancellingId(m.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/meetings/${m.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setCancelOpen(null);
      setCancelReason('');
      await load(scope);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'cancel failed');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            Founder cockpit
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Meetings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every booking from the lounge — review, hop into Google Meet, or cancel and notify the
            investor in one step.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
            {(['upcoming', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  scope === s
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'upcoming' ? 'Upcoming' : 'All'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(scope)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {rows === null ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading meetings…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            No meetings {scope === 'upcoming' ? 'on the calendar' : 'yet'}.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When investors pick a slot from the lounge, the booking lands here — with the Google
            Meet link, agenda, and a cancel button that emails them automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => {
            const first = group.rows[0];
            if (!first) return null;
            const headerLabel = new Intl.DateTimeFormat(undefined, {
              timeZone: 'Asia/Kolkata',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(first.startsAt));
            return (
              <section
                key={group.key}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
              >
                <header className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-rose-50 px-5 py-2.5">
                  <p className="text-sm font-semibold text-slate-900">{headerLabel}</p>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    {group.rows.length} meeting{group.rows.length === 1 ? '' : 's'}
                  </p>
                </header>
                <ul className="divide-y divide-slate-100">
                  {group.rows.map((m) => {
                    const investorName =
                      `${m.investor.firstName ?? ''} ${m.investor.lastName ?? ''}`.trim() ||
                      m.investor.email;
                    const isCancelling = cancellingId === m.id;
                    return (
                      <li key={m.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <p className="text-sm font-semibold text-slate-900">
                            {investorName}
                            {m.firmName ? (
                              <span className="text-slate-500"> — {m.firmName}</span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-slate-500">{m.investor.email}</p>
                          {m.agenda ? (
                            <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                              <span className="font-medium text-slate-700">Agenda:</span> {m.agenda}
                            </p>
                          ) : null}
                          <span className="mt-2 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-700">
                            {m.stage.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="sm:col-span-4">
                          {TZ_LABELS.map((t) => (
                            <p key={t.tz} className="text-xs text-slate-600">
                              <span className="inline-block w-14 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                                {t.label}
                              </span>
                              {formatIn(m.startsAt, t.tz)}
                            </p>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-start justify-end gap-1.5 sm:col-span-3">
                          {m.meetLink ? (
                            <a
                              href={m.meetLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100"
                            >
                              <Video className="h-3 w-3" /> Meet
                            </a>
                          ) : null}
                          <a
                            href={`mailto:${m.investor.email}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            <Mail className="h-3 w-3" /> Email
                          </a>
                          <a
                            href={`/cockpit/investors?lead=${m.leadId}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            <ArrowUpRight className="h-3 w-3" /> Lead
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleOpen(m);
                              const local = new Date(m.startsAt);
                              const tzOffset = local.getTimezoneOffset() * 60_000;
                              setRescheduleStart(
                                new Date(local.getTime() - tzOffset).toISOString().slice(0, 16),
                              );
                              setRescheduleDuration(
                                Math.max(
                                  15,
                                  Math.round(
                                    (new Date(m.endsAt).getTime() -
                                      new Date(m.startsAt).getTime()) /
                                      60_000,
                                  ),
                                ),
                              );
                              setRescheduleReason('');
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50"
                          >
                            <CalendarRange className="h-3 w-3" /> Move
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCancelOpen(m);
                              setCancelReason('');
                            }}
                            disabled={isCancelling}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                          >
                            {isCancelling ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CalendarOff className="h-3 w-3" />
                            )}
                            Cancel
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {cancelOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-rose-50 via-pink-50 to-fuchsia-50 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Cancel meeting</p>
              <button
                type="button"
                onClick={() => setCancelOpen(null)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-slate-700">
                We&apos;ll email{' '}
                <span className="font-semibold text-slate-900">
                  {cancelOpen.investor.firstName ?? cancelOpen.investor.email}
                </span>{' '}
                automatically. Reason is optional but goes straight into the email.
              </p>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {formatIn(cancelOpen.startsAt, 'Asia/Kolkata')} IST ·{' '}
                {formatIn(cancelOpen.startsAt, Intl.DateTimeFormat().resolvedOptions().timeZone)}{' '}
                local
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. Founder is travelling that week — sending fresh slots."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setCancelOpen(null)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Keep meeting
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={cancellingId === cancelOpen.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
              >
                {cancellingId === cancelOpen.id ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelling…
                  </>
                ) : (
                  <>Cancel &amp; notify investor</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rescheduleOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-rose-50 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">Move meeting</p>
              <button
                type="button"
                onClick={() => setRescheduleOpen(null)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-xs text-slate-600">
                Currently <strong>{formatIn(rescheduleOpen.startsAt, 'Asia/Kolkata')} IST</strong>.
                We&apos;ll send{' '}
                <strong>
                  {rescheduleOpen.investor.firstName ?? rescheduleOpen.investor.email}
                </strong>{' '}
                a single &quot;moved&quot; email with a fresh Google Meet link — no
                cancel-then-rebook spam.
              </p>
              <label className="block text-[11px]">
                <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
                  New start (your local time)
                </span>
                <input
                  type="datetime-local"
                  value={rescheduleStart}
                  onChange={(e) => setRescheduleStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </label>
              <label className="block text-[11px]">
                <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Duration
                </span>
                <select
                  value={rescheduleDuration}
                  onChange={(e) => setRescheduleDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </label>
              <textarea
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Optional reason — goes straight into the email"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setRescheduleOpen(null)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void confirmReschedule()}
                disabled={reschedulingId === rescheduleOpen.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
              >
                {reschedulingId === rescheduleOpen.id ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Moving…
                  </>
                ) : (
                  <>Move &amp; notify investor</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
