'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export type StagePromptKind = 'next_action' | 'closed_lost' | 'funded';

export type StagePromptResult =
  | { kind: 'next_action'; nextActionOwner: string; nextActionDue: string }
  | { kind: 'closed_lost'; closedLostReason: string }
  | { kind: 'funded'; fundedAmountUsd: number; fundedAt: string };

type Props = {
  kind: StagePromptKind;
  investorName: string;
  targetStage: string;
  defaultOwner?: string;
  onCancel: () => void;
  onSubmit: (result: StagePromptResult) => Promise<void>;
};

export function StagePromptModal({
  kind,
  investorName,
  targetStage,
  defaultOwner,
  onCancel,
  onSubmit,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Next-action fields
  const [nextActionOwner, setNextActionOwner] = useState(defaultOwner ?? '');
  const [nextActionDue, setNextActionDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  });

  // Closed-lost fields
  const [closedLostReason, setClosedLostReason] = useState('');

  // Funded fields
  const [fundedAmountUsd, setFundedAmountUsd] = useState<string>('');
  const [fundedAt, setFundedAt] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      if (kind === 'next_action') {
        if (!nextActionOwner.trim()) throw new Error('Owner is required');
        if (!nextActionDue) throw new Error('Due date is required');
        await onSubmit({
          kind: 'next_action',
          nextActionOwner: nextActionOwner.trim(),
          nextActionDue: new Date(nextActionDue).toISOString(),
        });
      } else if (kind === 'closed_lost') {
        if (closedLostReason.trim().length < 3) {
          throw new Error('Reason must be at least 3 characters');
        }
        await onSubmit({ kind: 'closed_lost', closedLostReason: closedLostReason.trim() });
      } else {
        const amount = Number(fundedAmountUsd);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number');
        }
        if (!fundedAt) throw new Error('Close date is required');
        await onSubmit({
          kind: 'funded',
          fundedAmountUsd: amount,
          fundedAt: new Date(fundedAt).toISOString(),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setSubmitting(false);
    }
  }

  const title =
    kind === 'next_action'
      ? `Set next action for ${investorName}`
      : kind === 'closed_lost'
        ? `Why is ${investorName} closing lost?`
        : `Record funding from ${investorName}`;
  const subtitle =
    kind === 'next_action'
      ? `Stage "${targetStage.replace(/_/g, ' ')}" requires an owner + due date.`
      : kind === 'closed_lost'
        ? 'A short reason helps you remember and learn.'
        : 'Amount + close date go on the lead and feed the round dashboard.';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Stage transition
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {kind === 'next_action' ? (
            <>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Owner (email or name)
                <input
                  value={nextActionOwner}
                  onChange={(e) => setNextActionOwner(e.target.value)}
                  placeholder="founder@ootaos.com"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Due
                <input
                  type="datetime-local"
                  value={nextActionDue}
                  onChange={(e) => setNextActionDue(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                />
              </label>
            </>
          ) : null}

          {kind === 'closed_lost' ? (
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Reason
              <textarea
                value={closedLostReason}
                onChange={(e) => setClosedLostReason(e.target.value)}
                placeholder='e.g. "Not their stage focus" or "Passed after diligence on TAM"'
                rows={4}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>
          ) : null}

          {kind === 'funded' ? (
            <>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Amount (USD)
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={fundedAmountUsd}
                  onChange={(e) => setFundedAmountUsd(e.target.value)}
                  placeholder="500000"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Close date
                <input
                  type="date"
                  value={fundedAt}
                  onChange={(e) => setFundedAt(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                />
              </label>
            </>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {kind === 'closed_lost'
                ? 'Mark closed-lost'
                : kind === 'funded'
                  ? 'Record funded'
                  : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
