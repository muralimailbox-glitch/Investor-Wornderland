'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';

type Props = {
  documentId: string;
  filename: string;
  html: string;
  isPdf: boolean;
  watermarkLabel: string;
  warnings: string[];
};

export function DocPreviewClient({
  documentId,
  filename,
  html,
  isPdf,
  watermarkLabel,
  warnings,
}: Props) {
  const [openRequest, setOpenRequest] = useState<'original_document' | 'more_info' | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setSent(null);
    try {
      const res = await fetch('/api/v1/lounge/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: openRequest,
          documentId: openRequest === 'original_document' ? documentId : undefined,
          message: message || undefined,
        }),
      });
      if (!res.ok) throw new Error('failed');
      setSent('Request sent. The founders will respond from info@ootaos.com within 24 hours.');
      setMessage('');
      setOpenRequest(null);
    } catch {
      setSent('Could not send — try again or email info@ootaos.com.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
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
          onClick={() => setOpenRequest('original_document')}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px"
        >
          <Send className="h-4 w-4" /> Request the original
        </button>
        <button
          type="button"
          onClick={() => setOpenRequest('more_info')}
          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 transition hover:border-violet-400"
        >
          <MessageSquare className="h-4 w-4" /> Ask the founders
        </button>
        <a href="/lounge" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to data room
        </a>
      </div>

      {sent ? <p className="text-xs text-emerald-700">{sent}</p> : null}

      {openRequest ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">
              {openRequest === 'original_document'
                ? `Request the original ${filename}`
                : 'Send a question to the founders'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              The founders will reply from info@ootaos.com within 24 hours.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                openRequest === 'original_document'
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
                  setOpenRequest(null);
                  setMessage('');
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || (openRequest === 'more_info' && !message.trim())}
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
