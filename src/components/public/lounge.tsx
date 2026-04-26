'use client';

import { motion } from 'framer-motion';
import { FileText, Loader2, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import { InvestorIdentityPill } from '@/components/public/investor-identity-pill';
import { MeetingCalendar } from '@/components/public/meeting-calendar';
import { WhatsappButton } from '@/components/public/whatsapp-button';

type Document = {
  id: string;
  kind: string;
  filename: string;
  sizeBytes: number;
  viewUrl: string;
  locked: boolean;
  minLeadStage: string | null;
};
type Slot = { startsAt: string; endsAt: string };

type Bundle = {
  investorName: string | null;
  investorFirstName: string | null;
  investorLastName: string | null;
  investorEmail: string;
  investorFirmName: string | null;
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

function shortTz(tz: string): string {
  const parts = tz.split('/');
  return parts[parts.length - 1]?.replace(/_/g, ' ') ?? tz;
}

export function Lounge() {
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'locked' | 'error'; bundle?: Bundle; error?: string }>({ status: 'loading' });
  const [bookedSlot, setBookedSlot] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState<{ kind: 'original_document' | 'more_info'; documentId?: string; filename?: string } | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSending, setRequestSending] = useState(false);
  const [requestSent, setRequestSent] = useState<string | null>(null);

  async function submitRequest() {
    if (!requestOpen) return;
    setRequestSending(true);
    try {
      const res = await fetch('/api/v1/lounge/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: requestOpen.kind,
          documentId: requestOpen.documentId,
          message: requestMessage || undefined,
        }),
      });
      if (!res.ok) throw new Error('request failed');
      setRequestSent(
        requestOpen.kind === 'original_document'
          ? `Request sent. The founders will respond from info@ootaos.com within 24 hours.`
          : `Sent. The founders will respond shortly.`,
      );
      setRequestMessage('');
      setRequestOpen(null);
    } catch {
      setRequestSent('Could not send — try again or email info@ootaos.com.');
    } finally {
      setRequestSending(false);
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InvestorIdentityPill
          firstName={bundle.investorFirstName}
          lastName={bundle.investorLastName}
          firmName={bundle.investorFirmName}
        />
        <p className="text-xs text-slate-500">
          Signed in as <span className="font-medium text-slate-700">{bundle.investorEmail}</span>
        </p>
      </div>
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
            bundle.documents.map((doc, i) => {
              if (doc.locked) {
                const stageLabel = (doc.minLeadStage ?? '').replace(/_/g, ' ');
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="group relative flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 backdrop-blur"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {doc.filename}
                      </p>
                      <p className="text-xs text-slate-500">
                        {doc.kind} · {formatBytes(doc.sizeBytes)}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                        Unlocks at: {stageLabel}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-600">
                        Book a 30-min founder call below — once we&apos;ve met, this opens
                        automatically.
                      </p>
                    </div>
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={doc.id}
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={`/lounge/document/${doc.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
                      >
                        <FileText className="h-3 w-3" /> Open preview
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          setRequestOpen({
                            kind: 'original_document',
                            documentId: doc.id,
                            filename: doc.filename,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:border-violet-400 hover:bg-violet-50"
                      >
                        <Send className="h-3 w-3" /> Request original
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-700">
            Book a 30-min founder call
          </h2>
          <p className="text-xs text-slate-500">
            Your time ({shortTz(bundle.investorTimezone)}) · founder is in IST. Mon–Sat,
            9–12 + 1:30–7. 20-hour notice. Up to 14 days out.
          </p>
        </div>
        <MeetingCalendar
          investorTimezone={bundle.investorTimezone}
          founderTimezone={bundle.founderTimezone}
          onBooked={(slots) => setBookedSlot(slots[0]?.startsAt ?? null)}
        />
        {bookedSlot ? (
          <p className="mt-3 text-xs text-emerald-700">
            ✓ Booked. We&apos;ve sent a confirmation with a Google Meet link to your inbox — feel
            free to send your own invite from any meeting tool.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Prefer WhatsApp?
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          Quickest way to reach the founder for a sharp question. Sydney-based, replies most
          messages within a few hours.
        </p>
        <div className="mt-3">
          <WhatsappButton
            message={`Hi Murali — investor question from the OotaOS lounge.${
              bundle.investorName ? ` (${bundle.investorName})` : ''
            }`}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-violet-100 bg-white/80 p-5 backdrop-blur">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
          Need something specific?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Ask Priya inline, request the original of any document, or send a free-text question
          straight to the founders.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRequestOpen({ kind: 'more_info' })}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px"
          >
            <MessageSquare className="h-4 w-4" /> Request more info
          </button>
        </div>
        {requestSent ? (
          <p className="mt-3 text-xs text-emerald-700">{requestSent}</p>
        ) : null}
      </section>

      {requestOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              {requestOpen.kind === 'original_document'
                ? `Request the original ${requestOpen.filename ?? 'document'}`
                : 'Send a question to the founders'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The founders will reply from info@ootaos.com within 24 hours.
            </p>
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              placeholder={
                requestOpen.kind === 'original_document'
                  ? 'Optional — say what you intend to use it for, or any context.'
                  : 'What would you like to ask?'
              }
              rows={5}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/40"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequestOpen(null);
                  setRequestMessage('');
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={requestSending || (requestOpen.kind === 'more_info' && !requestMessage.trim())}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requestSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
