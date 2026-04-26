'use client';

import { useState } from 'react';
import { Loader2, Mail, Send, X } from 'lucide-react';

type Recipient = { leadId: string; investorId: string; name: string; email: string };

type Props = {
  recipients: Recipient[];
  onClose: () => void;
  onSent: (sent: number, failed: number) => void;
};

const TEMPLATE_OPTIONS = [
  { value: '', label: 'Custom (use subject + body below)' },
  { value: 'outreach', label: 'Cold outreach' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'meeting_invite', label: 'Meeting invite' },
  { value: 'lounge_invite', label: 'Lounge invite' },
  { value: 'nda_sent', label: 'NDA welcome' },
  { value: 'update', label: 'Investor update' },
  { value: 'thank_you', label: 'Thank you' },
];

const DEFAULT_BODY = `Hi {{firstName}},

I'd love to share an update on OotaOS — we're a restaurant operating system raising $800K seed at $8M post. Your personalized link is below; ask Priya anything and the data room opens after a 60-second mutual NDA.

{{investorLink}}

Best,
Murali`;

export function BulkEmailModal({ recipients, onClose, onSent }: Props) {
  const [templateKey, setTemplateKey] = useState<string>('outreach');
  const [subject, setSubject] = useState('OotaOS — quick intro');
  const [body, setBody] = useState(DEFAULT_BODY);
  const [phase, setPhase] = useState<'compose' | 'review' | 'sending' | 'done' | 'error'>(
    'compose',
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  async function dispatch() {
    setPhase('sending');
    setError(null);
    try {
      // Step 1: create the batch (drafts queued, not yet sent).
      const createRes = await fetch('/api/v1/admin/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: recipients.map((r) => r.leadId),
          subject,
          bodyText: body,
          ...(templateKey ? { templateKey } : {}),
        }),
      });
      if (!createRes.ok) throw new Error(`create failed: HTTP ${createRes.status}`);
      const { batchId } = (await createRes.json()) as { batchId: string };

      // Step 2: dispatch the batch — this is the human-approved send action
      // (rule #11 satisfied via founder click).
      const dispatchRes = await fetch(`/api/v1/admin/batch/${batchId}/dispatch`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!dispatchRes.ok) throw new Error(`dispatch failed: HTTP ${dispatchRes.status}`);
      const r = (await dispatchRes.json()) as { sent: number; failed: number };
      setResult(r);
      setPhase('done');
      onSent(r.sent, r.failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
      setPhase('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Bulk email
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              Send to {recipients.length} investor{recipients.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-slate-500">
              Each recipient gets a personalized magic link. Founder approval = your click below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'compose' || phase === 'review' ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Template
              <select
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Body
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
              <span className="text-[10px] text-slate-400">
                Tokens: {'{{firstName}}'}, {'{{firmName}}'}, {'{{investorLink}}'}
              </span>
            </label>

            <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium">
                Recipients ({recipients.length})
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {recipients.map((r) => (
                  <li key={r.leadId} className="flex items-center justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="text-slate-400">{r.email}</span>
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void dispatch()}
                disabled={!subject.trim() || !body.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> Approve & send to {recipients.length}
              </button>
            </div>
          </div>
        ) : phase === 'sending' ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-sm text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            <p>
              Dispatching {recipients.length} email{recipients.length === 1 ? '' : 's'}…
            </p>
            <p className="text-xs text-slate-400">
              Each recipient gets a personalized magic link; leads auto-advance to “contacted”.
            </p>
          </div>
        ) : phase === 'done' && result ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <Mail className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium">
                  Sent {result.sent} of {recipients.length}.
                </p>
                {result.failed > 0 ? (
                  <p className="text-xs text-rose-700">
                    {result.failed} failed — check the inbox tab.
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white"
            >
              Close
            </button>
          </div>
        ) : phase === 'error' ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setPhase('compose')}
                className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm text-white"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
