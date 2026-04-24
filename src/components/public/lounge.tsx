'use client';

import { motion } from 'framer-motion';
import { CalendarCheck, Download, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

type Document = { id: string; kind: string; filename: string; sizeBytes: number; viewUrl: string };
type Slot = { startsAt: string; endsAt: string };

type Bundle = {
  investorName: string | null;
  investorTimezone: string;
  founderTimezone: string;
  documents: Document[];
  suggestedSlots: Slot[];
  signedAt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSlotIn(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function shortTz(tz: string): string {
  const parts = tz.split('/');
  return parts[parts.length - 1]?.replace(/_/g, ' ') ?? tz;
}

export function Lounge() {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'locked' | 'error'; bundle?: Bundle; error?: string }>({ status: 'loading' });
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [bookedSlot, setBookedSlot] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/lounge', { cache: 'no-store' });
        if (res.status === 401) {
          setState({ status: 'locked' });
          return;
        }
        if (!res.ok) throw new Error('failed');
        const bundle = (await res.json()) as Bundle;
        setState({ status: 'ok', bundle });
      } catch (e) {
        setState({ status: 'error', error: e instanceof Error ? e.message : 'failed' });
      }
    })();
  }, []);

  async function book(slot: Slot) {
    setBookingSlot(slot.startsAt);
    try {
      const res = await fetch('/api/v1/meeting/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: slot.startsAt, endsAt: slot.endsAt }),
      });
      if (!res.ok) throw new Error('booking failed');
      setBookedSlot(slot.startsAt);
    } catch {
      setBookingSlot(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-violet-100 bg-white/80 p-16 backdrop-blur">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (state.status === 'locked') {
    return (
      <div className="rounded-3xl border border-violet-100 bg-white/90 p-8 backdrop-blur">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">The lounge is gated</h2>
        <p className="mt-2 text-sm text-slate-600">Sign the NDA to unlock the data room and the founder calendar.</p>
        <a
          href="/nda"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-violet-500/30"
        >
          Sign NDA
        </a>
      </div>
    );
  }

  if (state.status === 'error' || !state.bundle) {
    return (
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-8 text-rose-800">
        We couldn&apos;t load the lounge. Try refreshing, or email info@ootaos.com.
      </div>
    );
  }

  const { bundle } = state;

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
      >
        <ShieldCheck className="h-5 w-5 text-emerald-600" />
        <span>
          NDA signed. Every download you take is watermarked with your email. Please don&apos;t forward.
        </span>
      </motion.div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">Data room</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {bundle.documents.length === 0 ? (
            <p className="text-sm text-slate-500">The founders are preparing this week&apos;s refresh — check back shortly.</p>
          ) : (
            bundle.documents.map((doc, i) => (
              <motion.a
                key={doc.id}
                href={doc.viewUrl}
                target="_blank"
                rel="noopener"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group flex items-start gap-3 rounded-2xl border border-violet-100 bg-white/90 p-4 shadow-[0_18px_40px_-28px_rgba(91,33,182,0.35)] backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-300"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-600 group-hover:text-white">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{doc.filename}</p>
                  <p className="text-xs text-slate-500">
                    {doc.kind} · {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                <Download className="mt-1 h-4 w-4 text-slate-400 transition group-hover:text-violet-700" />
              </motion.a>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
            Book a 30-min founder call
          </h2>
          <p className="text-xs text-slate-500">
            Your time ({shortTz(bundle.investorTimezone)}) · Priya&apos;s time ({shortTz(bundle.founderTimezone)})
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {bundle.suggestedSlots.length === 0 ? (
            <p className="text-sm text-slate-500 sm:col-span-3">
              No open slots this week. Email info@ootaos.com and we will make room.
            </p>
          ) : (
            bundle.suggestedSlots.map((slot) => {
              const booked = bookedSlot === slot.startsAt;
              const busy = bookingSlot === slot.startsAt;
              return (
                <button
                  key={slot.startsAt}
                  onClick={() => !booked && !busy && void book(slot)}
                  disabled={booked || busy}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition ${
                    booked
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : 'border-violet-100 bg-white/90 text-slate-900 hover:-translate-y-0.5 hover:border-violet-300'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-violet-700">
                    {booked ? <CalendarCheck className="h-3.5 w-3.5" /> : null}
                    {booked ? 'Booked' : busy ? 'Booking…' : 'Available'}
                  </span>
                  <span className="text-sm font-medium">
                    {formatSlotIn(slot.startsAt, bundle.investorTimezone)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatSlotIn(slot.startsAt, bundle.founderTimezone)} (Priya)
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
