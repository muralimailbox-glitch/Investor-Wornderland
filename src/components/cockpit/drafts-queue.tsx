'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Mail, Send } from 'lucide-react';

type Draft = {
  id: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: 'draft' | 'approved' | 'queued' | 'sent' | 'bounced' | 'failed';
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  leadId: string | null;
};

type StatusFilter = 'draft' | 'approved' | 'sent';

const STATUS_LABEL: Record<StatusFilter, string> = {
  draft: 'Pending approval',
  approved: 'Ready to send',
  sent: 'Sent',
};

export function DraftsQueue() {
  const [status, setStatus] = useState<StatusFilter>('draft');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/admin/drafts?status=${status}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { drafts: Draft[] };
      setDrafts(j.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
      fetch(`/api/v1/admin/drafts?status=${status}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as { drafts: Draft[] };
        })
        .then((j) => {
          if (alive) setDrafts(j.drafts);
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    });
    return () => {
      alive = false;
    };
  }, [status]);

  async function approve(id: string) {
    setActingId(id);
    try {
      const r = await fetch(`/api/v1/admin/draft/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setActingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
              Drafts queue
            </p>
            <p className="text-sm text-slate-600">
              Every AI-generated reply needs your click before it ships.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200">
          {(['draft', 'approved', 'sent'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                status === s
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Mail className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">
            {status === 'draft'
              ? 'No drafts waiting for approval.'
              : status === 'approved'
                ? 'No approved drafts in the send queue.'
                : 'No emails sent through the drafts pipeline yet.'}
          </p>
          {status === 'draft' ? (
            <p className="text-xs text-slate-500">
              AI-suggested replies in the inbox below will appear here for your review.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {drafts.map((d) => (
            <li key={d.id} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{d.subject}</p>
                <p className="truncate text-xs text-slate-500">to {d.toEmail}</p>
                <p className="mt-1 line-clamp-2 text-[12px] text-slate-600">{d.bodyText}</p>
                <p className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  {d.status === 'draft'
                    ? `created ${formatRelative(d.createdAt)}`
                    : d.status === 'approved'
                      ? `approved ${formatRelative(d.approvedAt ?? d.createdAt)}`
                      : `sent ${formatRelative(d.sentAt ?? d.createdAt)}`}
                </p>
              </div>
              <div className="flex flex-none items-start gap-2 pt-1">
                {status === 'draft' ? (
                  <button
                    type="button"
                    onClick={() => void approve(d.id)}
                    disabled={actingId === d.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actingId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                ) : status === 'approved' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <Send className="h-3 w-3" /> queued for send
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                    <CheckCircle2 className="h-3 w-3" /> sent
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
