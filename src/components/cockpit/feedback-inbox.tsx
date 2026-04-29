'use client';

/**
 * Founder-side inbox for investor feedback and document requests. One
 * unified view because both flow through document_feedback rows; the
 * card distinguishes them with kind labels and contextual fields.
 *
 * Acknowledgement clears the unread-badge counter on the cockpit shell.
 * The optimistic UI marks the row as acknowledged immediately; the API
 * write is fire-and-forget with an inline rollback if it fails.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  FilePlus2,
  Loader2,
  Mail,
  MessageSquare,
  Star,
} from 'lucide-react';

type Row = {
  id: string;
  kind: 'feedback' | 'request_new';
  rating: number | null;
  message: string;
  requestedTitle: string | null;
  submittedByEmail: string;
  acknowledgedAt: string | null;
  createdAt: string;
  documentId: string | null;
  documentTitle: string | null;
  documentFilename: string | null;
};

type Filter = 'unread' | 'all';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const ms = now - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function FeedbackInbox() {
  const [filter, setFilter] = useState<Filter>('unread');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Same set-state-outside-effect pattern used elsewhere in the cockpit
  // so the React Compiler lint stays happy.
  useEffect(() => {
    let alive = true;
    const handle = setTimeout(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
      fetch(`/api/v1/admin/document-feedback?status=${filter}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as { rows: Row[] };
        })
        .then((j) => {
          if (!alive) return;
          setRows(j.rows);
        })
        .catch((e) => {
          if (!alive) return;
          setError(e instanceof Error ? e.message : 'failed to load');
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [filter]);

  const counts = useMemo(() => {
    const all = rows?.length ?? 0;
    const unread = rows?.filter((r) => !r.acknowledgedAt).length ?? 0;
    return { all, unread };
  }, [rows]);

  async function toggleAck(row: Row) {
    const previous = row.acknowledgedAt;
    const nowIso = new Date().toISOString();
    setRows((cur) =>
      cur
        ? cur.map((r) => (r.id === row.id ? { ...r, acknowledgedAt: previous ? null : nowIso } : r))
        : cur,
    );
    try {
      const res = await fetch('/api/v1/admin/document-feedback', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, acknowledged: !previous }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Roll back the optimistic toggle.
      setRows((cur) =>
        cur ? cur.map((r) => (r.id === row.id ? { ...r, acknowledgedAt: previous } : r)) : cur,
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
          Data room feedback
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Investor feedback &amp; document requests
        </h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Every comment investors leave on a document — and every request for something we
          don&apos;t have yet — lands here. Mark each one as acknowledged once you&apos;ve read or
          actioned it.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('unread')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            filter === 'unread'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          Unread{counts.unread > 0 ? ` · ${counts.unread}` : ''}
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            filter === 'all'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          All
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" /> {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 px-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading feedback…
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {filter === 'unread' ? 'Nothing waiting on you.' : 'No feedback yet.'}
        </div>
      ) : rows ? (
        <ul className="space-y-3">
          {rows.map((r) => {
            const isFeedback = r.kind === 'feedback';
            const Icon = isFeedback ? MessageSquare : FilePlus2;
            const docLabel = r.documentTitle ?? r.documentFilename ?? null;
            return (
              <li
                key={r.id}
                className={`rounded-2xl border bg-white p-4 transition ${
                  r.acknowledgedAt ? 'border-slate-200 opacity-70' : 'border-violet-200 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${
                        isFeedback
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-fuchsia-100 text-fuchsia-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {isFeedback
                          ? `Feedback${docLabel ? ` on ${docLabel}` : ''}`
                          : `Document request: ${r.requestedTitle ?? 'untitled'}`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        <Mail className="mr-1 inline h-3 w-3" />
                        {r.submittedByEmail} · {formatTime(r.createdAt)}
                      </p>
                      {isFeedback && r.rating ? (
                        <div className="mt-1 inline-flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`h-3.5 w-3.5 ${
                                n <= (r.rating ?? 0)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleAck(r)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      r.acknowledgedAt
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                    }`}
                    title={r.acknowledgedAt ? 'Mark as unread' : 'Mark as acknowledged'}
                  >
                    {r.acknowledgedAt ? (
                      <>
                        <CircleHelp className="h-3.5 w-3.5" /> Mark unread
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledge
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {r.message}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
