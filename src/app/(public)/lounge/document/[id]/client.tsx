'use client';

import { useState } from 'react';
import { Download, Loader2, MessageSquare, Send, ShieldAlert, Star } from 'lucide-react';

type Props = {
  documentId: string;
  filename: string;
  html: string;
  isPdf: boolean;
  watermarkLabel: string;
  warnings: string[];
};

type ModalKind = 'original_document' | 'more_info' | 'feedback' | null;

export function DocPreviewClient({
  documentId,
  filename,
  html,
  isPdf,
  watermarkLabel,
  warnings,
}: Props) {
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  function reset() {
    setOpenModal(null);
    setMessage('');
    setRating(null);
  }

  async function send() {
    if (!openModal) return;
    setSending(true);
    setSent(null);
    try {
      // Document feedback flows through a dedicated endpoint that records
      // a row in document_feedback + emails the founder. The legacy
      // request flow (original / ask the founder) keeps using the
      // existing /lounge/request endpoint so its activity-log shape and
      // founder-side handling stay unchanged.
      if (openModal === 'feedback') {
        const res = await fetch('/api/v1/lounge/document-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'feedback',
            documentId,
            rating: rating ?? undefined,
            message: message.trim(),
          }),
        });
        if (!res.ok) throw new Error('failed');
        setSent('Thanks — your feedback was sent to the founder.');
      } else {
        const res = await fetch('/api/v1/lounge/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: openModal,
            documentId: openModal === 'original_document' ? documentId : undefined,
            message: message || undefined,
          }),
        });
        if (!res.ok) throw new Error('failed');
        setSent('Request sent. The founder will respond from info@ootaos.com within 24 hours.');
      }
      reset();
    } catch {
      setSent('Could not send — try again or email info@ootaos.com.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pre-legal-review notice. Documents in the data room are first
          drafts shared while we wait for legal sign-off — surface that
          inline so investors don't treat the rendered preview as final. */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold">Pre-legal-review draft</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            None of these documents have been signed off by our legal team yet. The browser preview
            is for reading convenience; download the original if you need the canonical version, and
            use the feedback button below to flag anything we should revisit.
          </p>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">Rendering notes:</p>
          <ul className="mt-1 list-inside list-disc">
            {warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_18px_60px_-30px_rgba(91,33,182,0.30)]">
        {/* CSS-tiled diagonal watermark; per investor */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 select-none"
          style={{
            backgroundImage: `repeating-linear-gradient(-30deg, rgba(124, 58, 237, 0.10) 0 240px, transparent 240px 480px)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-x-24 gap-y-24 overflow-hidden text-[11px] uppercase tracking-[0.18em] text-violet-500/40"
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="-rotate-30" style={{ transform: 'rotate(-30deg)' }}>
              {watermarkLabel}
            </span>
          ))}
        </div>

        {isPdf ? (
          <iframe
            title={filename}
            src={`/api/v1/document/${documentId}`}
            className="relative z-0 block h-[80vh] w-full"
          />
        ) : (
          <article
            className="prose prose-slate prose-sm relative z-0 max-w-none p-8 prose-headings:text-slate-900 prose-headings:tracking-tight prose-table:text-xs"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpenModal('feedback')}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-rose-500/30 transition hover:-translate-y-px"
        >
          <MessageSquare className="h-4 w-4" /> Leave feedback
        </button>
        <a
          href={`/api/v1/document/${documentId}`}
          download={filename}
          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition hover:border-violet-400"
        >
          <Download className="h-4 w-4" /> Download original
        </a>
        <button
          type="button"
          onClick={() => setOpenModal('original_document')}
          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition hover:border-violet-400"
        >
          <Send className="h-4 w-4" /> Request the original
        </button>
        <button
          type="button"
          onClick={() => setOpenModal('more_info')}
          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition hover:border-violet-400"
        >
          <MessageSquare className="h-4 w-4" /> Ask the founder
        </button>
        <a href="/lounge" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to data room
        </a>
      </div>

      {sent ? <p className="text-xs text-emerald-700">{sent}</p> : null}

      {openModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              {openModal === 'original_document'
                ? `Request the original ${filename}`
                : openModal === 'more_info'
                  ? 'Send a question to the founder'
                  : `Feedback on ${filename}`}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The founder will reply from info@ootaos.com within 24 hours.
            </p>

            {openModal === 'feedback' ? (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Rating
                </span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    className="transition hover:scale-110"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        rating !== null && n <= rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
                {rating ? (
                  <button
                    type="button"
                    onClick={() => setRating(null)}
                    className="ml-2 text-[11px] text-slate-400 hover:text-slate-700"
                  >
                    clear
                  </button>
                ) : null}
              </div>
            ) : null}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                openModal === 'original_document'
                  ? 'Optional — say what you intend to use it for, or any context.'
                  : openModal === 'more_info'
                    ? 'What would you like to ask?'
                    : 'What worked, what was unclear, what should we add or rewrite?'
              }
              rows={5}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/40"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={
                  sending ||
                  ((openModal === 'more_info' || openModal === 'feedback') && !message.trim())
                }
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
