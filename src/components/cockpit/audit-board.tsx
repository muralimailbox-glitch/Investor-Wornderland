'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Shield } from 'lucide-react';

type AuditEvent = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  actorUserId: string | null;
  workspaceId: string;
  createdAt: string;
};

const COMMON_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'NDA', value: 'nda' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Meetings', value: 'meeting' },
  { label: 'Invite link', value: 'invite_link' },
  { label: 'Investors', value: 'investor' },
  { label: 'Lounge', value: 'lounge' },
];

export function AuditBoard() {
  const [rows, setRows] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setRows(null);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/audit?limit=200', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { rows: AuditEvent[] };
      setRows(j.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [] as AuditEvent[];
    return rows.filter((r) => {
      if (filter && !r.action.toLowerCase().includes(filter.toLowerCase())) return false;
      if (search) {
        const q = search.toLowerCase();
        const blob =
          `${r.action} ${r.targetType ?? ''} ${r.targetId ?? ''} ${JSON.stringify(r.payload)}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            Founder cockpit
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every state-changing action — NDA signings, link issuance, drafts, meeting moves, stage
            transitions. Sorted newest first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {COMMON_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === f.value
                ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search payload, target id…"
          className="ml-auto w-48 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {rows === null ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit log…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <Shield className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            No events {filter || search ? 'match those filters' : 'yet'}.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {visible.map((e) => (
              <li key={e.id} className="grid grid-cols-12 gap-3 px-5 py-3 text-xs">
                <div className="col-span-3 text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </div>
                <div className="col-span-3 font-mono font-semibold text-slate-900">{e.action}</div>
                <div className="col-span-2 text-slate-600">
                  {e.targetType ?? '—'}
                  {e.targetId ? (
                    <span className="block font-mono text-[10px] text-slate-400">
                      {e.targetId.slice(0, 8)}…
                    </span>
                  ) : null}
                </div>
                <div className="col-span-4 truncate font-mono text-[10px] text-slate-500">
                  {Object.keys(e.payload ?? {}).length > 0 ? JSON.stringify(e.payload) : '—'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
