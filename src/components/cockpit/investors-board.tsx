'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Building2,
  Eye,
  Filter,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Upload,
  UserCircle2,
  Wrench,
} from 'lucide-react';

import { FirmEditModal } from '@/components/cockpit/firm-edit-modal';
import { InvestorActivityDrawer } from '@/components/cockpit/investor-activity-drawer';
import { InvestorEditModal } from '@/components/cockpit/investor-edit-modal';
import { TracxnImportModal } from '@/components/cockpit/tracxn-import';
import { startPreview } from '@/lib/api/preview';

type Firm = {
  id: string;
  name: string;
  firmType: string;
  hqCity: string | null;
  hqCountry: string | null;
};

type Investor = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  decisionAuthority: string;
  timezone: string;
  updatedAt: string;
};

type Lead = {
  id: string;
  stage: string;
  updatedAt: string;
} | null;

type Row = { investor: Investor | null; firm: Firm; lead: Lead; partnerPending: boolean };

type ListResponse = { rows: Row[]; page: number; pageSize: number; total: number };

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-700',
  contacted: 'bg-sky-100 text-sky-700',
  engaged: 'bg-indigo-100 text-indigo-700',
  nda_pending: 'bg-amber-100 text-amber-700',
  nda_signed: 'bg-violet-100 text-violet-700',
  meeting_scheduled: 'bg-fuchsia-100 text-fuchsia-700',
  diligence: 'bg-blue-100 text-blue-700',
  term_sheet: 'bg-emerald-100 text-emerald-700',
  funded: 'bg-emerald-200 text-emerald-800',
  closed_lost: 'bg-rose-100 text-rose-700',
};

const FIRM_TYPES = ['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate'];

export function InvestorsBoard() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [firmType, setFirmType] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingFirmId, setEditingFirmId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (firmType) p.set('firmType', firmType);
    p.set('pageSize', '200');
    return p.toString();
  }, [search, firmType]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
      fetch(`/api/v1/admin/investors?${query}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return (await r.json()) as ListResponse;
        })
        .then((d) => {
          if (!alive) return;
          setData(d);
        })
        .catch((e: Error) => {
          if (!alive) return;
          setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  async function refresh() {
    const r = await fetch(`/api/v1/admin/investors?${query}`, { credentials: 'include' });
    if (r.ok) setData((await r.json()) as ListResponse);
  }

  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState<string | null>(null);
  async function repairPipeline() {
    setRepairing(true);
    setRepairNote(null);
    try {
      const r = await fetch('/api/v1/admin/pipeline/repair', {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { created: number; skipped: number; total: number };
      setRepairNote(
        j.created === 0
          ? `All ${j.total} investors already have a lead — nothing to repair.`
          : `Created ${j.created} new lead${j.created === 1 ? '' : 's'} (${j.skipped} already had one). Pipeline is now complete.`,
      );
      await refresh();
    } catch (e) {
      setRepairNote(`Repair failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
            Investors
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Who&apos;s in the book
          </h1>
          <p className="text-[15px] text-slate-600">
            Every firm and partner you&apos;re building a relationship with.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void repairPipeline()}
            disabled={repairing}
            title="Create a lead on the active deal for any investor that doesn't have one. Idempotent."
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 shadow-sm transition hover:-translate-y-px hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {repairing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Repair pipeline
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-700 shadow-sm transition hover:-translate-y-px hover:bg-violet-50"
          >
            <Sparkles className="h-4 w-4" /> Import from Tracxn
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px"
          >
            <Plus className="h-4 w-4" /> Add investor
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or firm"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
        </label>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={firmType}
            onChange={(e) => setFirmType(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          >
            <option value="">All firm types</option>
            {FIRM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load ({error}). Try reloading.
        </div>
      ) : null}

      {repairNote ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {repairNote}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_1.2fr_1fr_0.9fr_0.6fr] gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          <span>Investor</span>
          <span>Firm</span>
          <span>Role</span>
          <span>Stage</span>
          <span className="text-right">Actions</span>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading investors
          </div>
        ) : data && data.rows.length === 0 ? (
          <Empty onAdd={() => setCreateOpen(true)} />
        ) : (
          <div>
            {data?.rows.map((row, idx) => (
              <motion.div
                key={row.investor?.id ?? `pending-${row.firm.id}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.02 * idx, 0.3) }}
                className="grid grid-cols-[1.4fr_1.2fr_1fr_0.9fr_0.6fr] items-center gap-4 border-b border-slate-100 px-6 py-4 transition hover:bg-violet-50/40 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${row.partnerPending ? 'bg-slate-100 text-slate-400' : 'bg-violet-100 text-violet-700'}`}
                  >
                    <UserCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    {row.investor ? (
                      <>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.investor.firstName} {row.investor.lastName}
                        </p>
                        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                          <Mail className="h-3 w-3" /> {row.investor.email}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="truncate text-sm font-medium text-slate-400 italic">
                          Partner pending
                        </p>
                        <p className="truncate text-xs text-slate-300">No contact added yet</p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFirmId(row.firm.id)}
                  className="flex items-center gap-2 min-w-0 rounded-lg px-1 py-1 text-left transition hover:bg-violet-50"
                  title="Edit firm"
                >
                  <Building2 className="h-4 w-4 flex-none text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{row.firm.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.firm.firmType.replace(/_/g, ' ')}
                      {row.firm.hqCity ? ` · ${row.firm.hqCity}` : ''}
                    </p>
                  </div>
                </button>
                <div className="min-w-0">
                  {row.investor ? (
                    <>
                      <p className="truncate text-sm text-slate-700">{row.investor.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {row.investor.decisionAuthority.replace(/_/g, ' ')}
                      </p>
                    </>
                  ) : (
                    <p className="truncate text-xs text-slate-300 italic">—</p>
                  )}
                </div>
                <div>
                  {row.lead ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        STAGE_COLORS[row.lead.stage] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.lead.stage.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">no lead yet</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {row.partnerPending ? (
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                      title="Add a contact for this firm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add contact
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="View activity & interests"
                        onClick={() => setActivityId(row.investor!.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Activity className="h-3.5 w-3.5" />
                        Activity
                      </button>
                      <button
                        type="button"
                        title="Edit investor"
                        onClick={() => setEditingId(row.investor!.id)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        title="Preview wonderland as this investor"
                        onClick={async () => {
                          try {
                            const { url } = await startPreview({
                              investorId: row.investor!.id,
                              returnTo: '/lounge',
                            });
                            window.open(url, '_blank', 'noopener');
                          } catch {
                            // silent
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View as
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {data ? (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-500">
            <span>
              {data.rows.length} of {data.total}
            </span>
            <span>page {data.page}</span>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {createOpen ? (
          <CreateInvestorModal
            onClose={() => setCreateOpen(false)}
            onCreated={async () => {
              setCreateOpen(false);
              await refresh();
            }}
          />
        ) : null}
      </AnimatePresence>

      <TracxnImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          void refresh();
        }}
      />

      {editingId ? (
        <InvestorEditModal
          investorId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            void refresh();
          }}
        />
      ) : null}

      {editingFirmId ? (
        <FirmEditModal
          firmId={editingFirmId}
          onClose={() => setEditingFirmId(null)}
          onSaved={() => {
            setEditingFirmId(null);
            void refresh();
          }}
        />
      ) : null}

      {activityId ? (
        <InvestorActivityDrawer investorId={activityId} onClose={() => setActivityId(null)} />
      ) : null}
    </div>
  );
}

function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
        <Upload className="h-5 w-5" />
      </div>
      <p className="text-base font-semibold text-slate-900">No investors yet.</p>
      <p className="text-sm text-slate-500">Add one by hand or import a CSV to get started.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px"
      >
        <Plus className="h-4 w-4" /> Add your first investor
      </button>
    </div>
  );
}

function CreateInvestorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firmName, setFirmName] = useState('');
  const [firmTypeVal, setFirmTypeVal] = useState('vc');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('Partner');
  const [decisionAuthority, setDecisionAuthority] = useState('full');
  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/admin/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firmName,
          firmType: firmTypeVal,
          firstName,
          lastName,
          title,
          decisionAuthority,
          email,
          timezone,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? `${res.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/40 bg-white p-6 shadow-[0_40px_100px_-30px_rgba(91,33,182,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
              New investor
            </p>
            <h2 className="text-lg font-semibold text-slate-900">Add to the book</h2>
          </div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="First name" value={firstName} onChange={setFirstName} required />
            <TextField label="Last name" value={lastName} onChange={setLastName} required />
          </div>
          <TextField label="Email" value={email} onChange={setEmail} type="email" required />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Title" value={title} onChange={setTitle} required />
            <TextField
              label="Decision authority"
              value={decisionAuthority}
              onChange={setDecisionAuthority}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Firm name" value={firmName} onChange={setFirmName} required />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Firm type
              </span>
              <select
                value={firmTypeVal}
                onChange={(e) => setFirmTypeVal(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              >
                {FIRM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TextField label="Timezone" value={timezone} onChange={setTimezone} required />
          {err ? <p className="text-sm text-rose-600">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-violet-500/40 transition hover:-translate-y-px disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save investor
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function TextField({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        {...rest}
      />
    </label>
  );
}
