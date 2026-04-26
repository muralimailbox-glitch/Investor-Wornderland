'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Mail, RefreshCw, Send, Trash2, X } from 'lucide-react';

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

type Tab = 'draft' | 'approved' | 'sent';

export function DraftsBoard() {
  const [tab, setTab] = useState<Tab>('draft');
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function load(status: Tab) {
    setRows(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/drafts?status=${status}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { drafts: Draft[] };
      setRows(j.drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load(tab);
    });
  }, [tab]);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/draft/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setActionMessage('Approved.');
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function dispatch(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/draft/${id}/dispatch`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setActionMessage('Sent — auto-logged on the lead timeline.');
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed');
    } finally {
      setBusyId(null);
    }
  }

  async function discard(id: string) {
    if (!confirm('Discard this draft? It will not be sent.')) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/draft/${id}/discard`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      setActionMessage('Discarded.');
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'discard failed');
    } finally {
      setBusyId(null);
    }
  }

  async function approveAndSend(id: string) {
    await approve(id);
    await dispatch(id);
  }

  const preview = useMemo(
    () => (previewId ? (rows?.find((r) => r.id === previewId) ?? null) : null),
    [previewId, rows],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            Founder cockpit
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Drafts &amp; outbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every AI- or template-generated email lands here as a draft. Approve, send, or discard —
            nothing leaves OotaOS without your eyes on it.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
            {(['draft', 'approved', 'sent'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTab(s)}
                className={`rounded-full px-3 py-1 font-medium transition ${
                  tab === s
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'draft' ? 'Pending' : s === 'approved' ? 'Approved' : 'Sent'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(tab)}
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
      {actionMessage && !error ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> {actionMessage}
        </div>
      ) : null}

      {rows === null ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            No{' '}
            {tab === 'draft'
              ? 'pending drafts'
              : tab === 'approved'
                ? 'approved drafts'
                : 'sent emails'}{' '}
            yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Drafts appear here as soon as you generate one from the inbox / activity drawer or from
            the bulk-email flow.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {rows.map((d) => {
              const isBusy = busyId === d.id;
              return (
                <li key={d.id} className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-12">
                  <div className="sm:col-span-7">
                    <p className="text-sm font-semibold text-slate-900">{d.subject}</p>
                    <p className="text-[11px] text-slate-500">to {d.toEmail}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{d.bodyText}</p>
                    {d.approvedAt ? (
                      <p className="mt-1 text-[10px] text-emerald-700">
                        Approved {new Date(d.approvedAt).toLocaleString()}
                      </p>
                    ) : null}
                    {d.sentAt ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Sent {new Date(d.sentAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-1.5 sm:col-span-5">
                    <button
                      type="button"
                      onClick={() => setPreviewId(d.id)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Preview
                    </button>
                    {tab === 'draft' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void approve(d.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void approveAndSend(d.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Approve &amp; send
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(d.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3 w-3" /> Discard
                        </button>
                      </>
                    ) : tab === 'approved' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void dispatch(d.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Send now
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(d.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3 w-3" /> Discard
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-rose-50 px-5 py-3">
              <p className="text-sm font-semibold text-slate-900">{preview.subject}</p>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="rounded-full p-1 text-slate-500 transition hover:bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-sm text-slate-700">
              <p className="mb-3 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                To: {preview.toEmail}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700">
                {preview.bodyText}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
