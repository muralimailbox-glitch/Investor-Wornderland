'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Building2,
  Eye,
  Filter,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCircle2,
  Wrench,
} from 'lucide-react';

import { BulkEmailModal } from '@/components/cockpit/bulk-email-modal';
import { FirmEditModal } from '@/components/cockpit/firm-edit-modal';
import { InvestorActivityDrawer } from '@/components/cockpit/investor-activity-drawer';
import { InvestorEditModal } from '@/components/cockpit/investor-edit-modal';
import { InviteLinkModal } from '@/components/cockpit/invite-link-modal';
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
  warmthScore: number | null;
  lastContactAt: string | null;
  sectorInterests: string[] | null;
  stageInterests: string[] | null;
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
  const [stage, setStage] = useState<string>('');
  // Saved smart segments — quick filters that compose on top of search/firmType.
  // 'all' is no extra filter; the others narrow down to specific work-states.
  type Segment = 'all' | 'hot' | 'partner_pending' | 'stale' | 'awaiting_reply';
  const [segment, setSegment] = useState<Segment>('all');
  type SortKey = 'warmth' | 'last_contact' | 'firm_name' | 'updated';
  const [sortKey, setSortKey] = useState<SortKey>('warmth');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingFirmId, setEditingFirmId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  function toggleSelect(leadId: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }
  function clearSelection() {
    setSelectedLeadIds(new Set());
  }
  // Server caps batch creation at MAX_BATCH_SIZE (50). Going higher
  // 4xxes the create-batch route, so we mirror the cap client-side.
  const MAX_COHORT_SIZE = 50;

  function selectAllVisible() {
    // Select-all respects the current segment+sort filter so the founder
    // can fire bulk-email at exactly the visible cohort.
    const allLeadIds = visibleRows.map((r) => r.lead?.id).filter((id): id is string => Boolean(id));
    if (allLeadIds.length === 0) return;
    // Cap at MAX_COHORT_SIZE — visible rows are sorted by the active
    // sort key, so the cap keeps the top N (by warmth, last contact,
    // etc.) rather than the trailing tail.
    setSelectedLeadIds(new Set(allLeadIds.slice(0, MAX_COHORT_SIZE)));
  }

  /**
   * Cohort outreach: select all visible leads (capped) and open the bulk
   * email modal. Wired to the segment chips so the founder can click
   * "Hot ≥80 → Email this cohort" in two interactions.
   */
  function emailCohort() {
    selectAllVisible();
    setBulkOpen(true);
  }
  // visibleEmailableCount is computed below visibleRows is declared.

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (firmType) p.set('firmType', firmType);
    if (stage) p.set('stage', stage);
    p.set('pageSize', '500');
    return p.toString();
  }, [search, firmType, stage]);

  // Stable "now" snapshot via useState init — purity-safe (state, not a
  // bare Date.now() inside a hook) and a valid useMemo dependency.
  const STALE_DAYS = 30;
  const [staleCutoff] = useState(() => Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Client-side segment + sort over the fetched rows. The API already does
  // search/firmType/stage; segments are derived from columns the API returns
  // (warmthScore, lastContactAt) so we can filter without another round trip.
  // React Compiler memoizes this automatically — manual useMemo here trips
  // its preserve-manual-memoization rule because of the staleCutoff dep.
  const visibleRows = (() => {
    const rows = data?.rows ?? [];
    const filtered = rows.filter((r) => {
      if (segment === 'all') return true;
      if (segment === 'partner_pending') return r.partnerPending;
      if (segment === 'hot') return (r.investor?.warmthScore ?? 0) >= 80;
      if (segment === 'stale') {
        if (!r.investor) return false;
        const last = r.investor.lastContactAt ? new Date(r.investor.lastContactAt).getTime() : 0;
        return last < staleCutoff;
      }
      if (segment === 'awaiting_reply') {
        // Heuristic: meeting_scheduled + diligence + term_sheet stages where
        // we're typically waiting on the investor. Refine with interaction
        // direction once the API surfaces it.
        return Boolean(r.lead && ['nda_pending', 'diligence', 'term_sheet'].includes(r.lead.stage));
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortKey === 'warmth') {
        return (b.investor?.warmthScore ?? -1) - (a.investor?.warmthScore ?? -1);
      }
      if (sortKey === 'last_contact') {
        const at = a.investor?.lastContactAt ? new Date(a.investor.lastContactAt).getTime() : 0;
        const bt = b.investor?.lastContactAt ? new Date(b.investor.lastContactAt).getTime() : 0;
        return bt - at;
      }
      if (sortKey === 'firm_name') {
        return a.firm.name.localeCompare(b.firm.name);
      }
      // 'updated' — most-recently-touched first
      const at = a.investor?.updatedAt ? new Date(a.investor.updatedAt).getTime() : 0;
      const bt = b.investor?.updatedAt ? new Date(b.investor.updatedAt).getTime() : 0;
      return bt - at;
    });
  })();

  // Count of leads-with-investors actually emailable in the current view.
  // Used by the "Email cohort" button to decide whether to render and how
  // to label the count vs the MAX_COHORT_SIZE cap.
  const visibleEmailableCount = visibleRows.filter((r) => r.lead && r.investor).length;

  // Quick counts for segment-chip badges, derived from the same dataset.
  const segmentCounts = (() => {
    const rows = data?.rows ?? [];
    const counts = { all: rows.length, hot: 0, partner_pending: 0, stale: 0, awaiting_reply: 0 };
    for (const r of rows) {
      if (r.partnerPending) counts.partner_pending++;
      if ((r.investor?.warmthScore ?? 0) >= 80) counts.hot++;
      if (r.investor) {
        const last = r.investor.lastContactAt ? new Date(r.investor.lastContactAt).getTime() : 0;
        if (last < staleCutoff) counts.stale++;
      }
      if (r.lead && ['nda_pending', 'diligence', 'term_sheet'].includes(r.lead.stage)) {
        counts.awaiting_reply++;
      }
    }
    return counts;
  })();

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
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  /**
   * Single-row deletion. Uses mode='hard' so the row + its leads/interactions
   * cascade out — the founder asked for true delete, not GDPR anonymise.
   * Confirms via window.confirm to make the action reversible-by-cancel.
   */
  async function deleteInvestor(investor: Investor) {
    const ok = window.confirm(
      `Delete ${investor.firstName} ${investor.lastName} (${investor.email})?\n\n` +
        `This permanently removes the investor, their pipeline lead, and all activity history. This cannot be undone.`,
    );
    if (!ok) return;
    setRowActionId(investor.id);
    setRowError(null);
    try {
      const r = await fetch(`/api/v1/admin/investors/${investor.id}/delete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, mode: 'hard' }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { title?: string; error?: string };
        throw new Error(j.title || j.error || `HTTP ${r.status}`);
      }
      await refresh();
    } catch (e) {
      setRowError(`Delete failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setRowActionId(null);
    }
  }

  /**
   * Single-row stage move. Uses force=true so the founder isn't blocked by
   * the strict prospect→contacted→engaged ladder — they often need to jump
   * (e.g. straight to nda_signed after a hallway intro). Stage rules that
   * the service still enforces (closed_lost reason, funded amount, next-
   * action owner/due) are collected via window.prompt with sane defaults.
   */
  async function moveStage(row: Row, nextStage: string) {
    if (!row.lead || !row.investor) return;
    const STAGES_NEEDING_NEXT_ACTION = [
      'engaged',
      'nda_pending',
      'nda_signed',
      'meeting_scheduled',
      'diligence',
      'term_sheet',
    ];
    const body: Record<string, unknown> = {
      leadId: row.lead.id,
      nextStage,
      force: true,
    };
    if (nextStage === 'closed_lost') {
      const reason = window.prompt('Closed-lost reason (min 3 chars):');
      if (!reason || reason.trim().length < 3) return;
      body.closedLostReason = reason.trim();
    } else if (nextStage === 'funded') {
      const amt = window.prompt('Funded amount in USD (whole number, no commas):');
      if (amt === null) return;
      const amtN = Number(amt);
      if (!Number.isFinite(amtN) || amtN <= 0) {
        setRowError('Funded amount must be a positive integer.');
        return;
      }
      body.fundedAmountUsd = Math.floor(amtN);
      body.fundedAt = new Date().toISOString();
    } else if (STAGES_NEEDING_NEXT_ACTION.includes(nextStage)) {
      const owner = window.prompt('Next-action owner (your name):', 'Krish');
      if (!owner) return;
      body.nextActionOwner = owner.trim();
      body.nextActionDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    setRowActionId(row.investor.id);
    setRowError(null);
    try {
      const r = await fetch('/api/v1/admin/pipeline/transition', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { title?: string; error?: string };
        throw new Error(j.title || j.error || `HTTP ${r.status}`);
      }
      await refresh();
    } catch (e) {
      setRowError(`Move failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setRowActionId(null);
    }
  }
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

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all' as const, label: 'All', n: segmentCounts.all },
              { key: 'hot' as const, label: 'Hot ≥80', n: segmentCounts.hot },
              {
                key: 'partner_pending' as const,
                label: 'Partner pending',
                n: segmentCounts.partner_pending,
              },
              { key: 'stale' as const, label: 'No contact 30d+', n: segmentCounts.stale },
              {
                key: 'awaiting_reply' as const,
                label: 'Awaiting reply',
                n: segmentCounts.awaiting_reply,
              },
            ] as const
          ).map((s) => {
            const active = segment === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSegment(s.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-transparent bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.label}
                <span
                  className={`rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.n}
                </span>
              </button>
            );
          })}
        </div>
        {/* Cohort outreach — fires the bulk modal pre-loaded with the visible
            cohort. Disabled when there's nothing emailable in the current
            view (e.g. "Partner pending" segment is firm-only). */}
        {visibleEmailableCount > 0 ? (
          <button
            type="button"
            onClick={emailCohort}
            title={
              visibleEmailableCount > MAX_COHORT_SIZE
                ? `${visibleEmailableCount} match — emailing top ${MAX_COHORT_SIZE} by current sort`
                : `Email all ${visibleEmailableCount} visible investors`
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px"
          >
            <Mail className="h-3.5 w-3.5" />
            Email cohort{' '}
            {visibleEmailableCount > MAX_COHORT_SIZE
              ? `(top ${MAX_COHORT_SIZE} of ${visibleEmailableCount})`
              : `(${visibleEmailableCount})`}
          </button>
        ) : null}
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
            aria-label="Filter by firm type"
          >
            <option value="">All firm types</option>
            {FIRM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            aria-label="Filter by lead stage"
          >
            <option value="">All stages</option>
            {[
              'prospect',
              'contacted',
              'engaged',
              'nda_pending',
              'nda_signed',
              'meeting_scheduled',
              'diligence',
              'term_sheet',
              'funded',
              'closed_lost',
            ].map((st) => (
              <option key={st} value={st}>
                {st.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            aria-label="Sort"
            title="Sort"
          >
            <option value="warmth">Sort: warmth ↓</option>
            <option value="last_contact">Sort: last contact ↓</option>
            <option value="firm_name">Sort: firm name</option>
            <option value="updated">Sort: recently updated</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Failed to load ({error}). Try reloading.
        </div>
      ) : null}

      {rowError ? (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{rowError}</span>
          <button
            type="button"
            onClick={() => setRowError(null)}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {repairNote ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {repairNote}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs font-medium text-slate-500">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={
                visibleRows.filter((r) => r.lead).length > 0 &&
                selectedLeadIds.size === visibleRows.filter((r) => r.lead).length
              }
              onChange={(e) => {
                if (e.target.checked) selectAllVisible();
                else clearSelection();
              }}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-violet-600 focus:ring-violet-400"
            />
            <span className="uppercase tracking-[0.12em]">
              {selectedLeadIds.size > 0
                ? `${selectedLeadIds.size} selected`
                : `Select all (${visibleRows.length})`}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              disabled={selectedLeadIds.size === 0}
              title={
                selectedLeadIds.size === 0
                  ? 'Tick at least one investor to email in bulk'
                  : `Send to ${selectedLeadIds.size} selected`
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >
              <Mail className="h-3.5 w-3.5" /> Bulk email{' '}
              {selectedLeadIds.size > 0 ? `(${selectedLeadIds.size})` : ''}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[24px_1.3fr_1.1fr_0.9fr_0.8fr_1.4fr] gap-4 border-b border-slate-100 bg-slate-50 px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
          <span aria-label="Select" />
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
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
            <p>No investors match the current filters.</p>
            <button
              type="button"
              onClick={() => {
                setSegment('all');
                setSearch('');
                setFirmType('');
                setStage('');
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div>
            {visibleRows.map((row, idx) => (
              <motion.div
                key={row.investor?.id ?? `pending-${row.firm.id}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.02 * idx, 0.3) }}
                className="grid grid-cols-[24px_1.3fr_1.1fr_0.9fr_0.8fr_1.4fr] items-center gap-4 border-b border-slate-100 px-6 py-4 transition hover:bg-violet-50/40 last:border-b-0"
              >
                <div>
                  {row.lead ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.investor?.firstName ?? row.firm.name}`}
                      checked={selectedLeadIds.has(row.lead.id)}
                      onChange={() => toggleSelect(row.lead!.id)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                    />
                  ) : null}
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${row.partnerPending ? 'bg-slate-100 text-slate-400' : 'bg-violet-100 text-violet-700'}`}
                  >
                    <UserCircle2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    {row.investor ? (
                      <>
                        <Link
                          href={`/cockpit/investors/${row.investor.id}`}
                          className="block truncate text-sm font-semibold text-slate-900 hover:underline"
                          title="Open full profile"
                        >
                          {row.investor.firstName} {row.investor.lastName}
                        </Link>
                        <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                          <Mail className="h-3 w-3" /> {row.investor.email}
                        </p>
                      </>
                    ) : (
                      <>
                        <p
                          className="truncate text-sm font-semibold text-slate-700"
                          title={row.firm.name}
                        >
                          {row.firm.name}
                        </p>
                        <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          <Mail className="h-3 w-3" /> No contact
                        </span>
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
                <div className="flex flex-wrap items-center justify-end gap-1">
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
                        title="Issue private invite link"
                        onClick={() =>
                          setInviteFor({
                            id: row.investor!.id,
                            name: `${row.investor!.firstName} ${row.investor!.lastName}`.trim(),
                            email: row.investor!.email,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Send link
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
                      {row.lead ? (
                        <select
                          aria-label="Move to stage"
                          title="Move this investor to a different pipeline stage"
                          disabled={rowActionId === row.investor!.id}
                          value={row.lead.stage}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next && next !== row.lead!.stage) void moveStage(row, next);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 disabled:opacity-50"
                        >
                          {[
                            'prospect',
                            'contacted',
                            'engaged',
                            'nda_pending',
                            'nda_signed',
                            'meeting_scheduled',
                            'diligence',
                            'term_sheet',
                            'funded',
                            'closed_lost',
                          ].map((st) => (
                            <option key={st} value={st}>
                              → {st.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        title="Delete investor (permanent)"
                        disabled={rowActionId === row.investor!.id}
                        onClick={() => void deleteInvestor(row.investor!)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {rowActionId === row.investor!.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
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

      {inviteFor ? (
        <InviteLinkModal
          investorId={inviteFor.id}
          investorName={inviteFor.name}
          investorEmail={inviteFor.email}
          onClose={() => setInviteFor(null)}
        />
      ) : null}

      {/* Bulk-email floating action bar — appears when ≥1 investor selected. */}
      {selectedLeadIds.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
          <div className="flex items-center gap-3 rounded-full border border-violet-200 bg-white px-5 py-2.5 shadow-2xl">
            <span className="text-sm font-medium text-slate-900">
              {selectedLeadIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px"
            >
              <Mail className="h-4 w-4" /> Bulk email
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <BulkEmailModal
          recipients={Array.from(selectedLeadIds).flatMap((leadId) => {
            const row = data?.rows.find((r) => r.lead?.id === leadId);
            if (!row?.investor || !row.lead) return [];
            return [
              {
                leadId: row.lead.id,
                investorId: row.investor.id,
                name: `${row.investor.firstName} ${row.investor.lastName}`,
                email: row.investor.email,
              },
            ];
          })}
          onClose={() => setBulkOpen(false)}
          onSent={() => {
            setBulkOpen(false);
            clearSelection();
            void refresh();
          }}
        />
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

type CreateForm = {
  firmName: string;
  firmType: string;
  firstName: string;
  lastName: string;
  title: string;
  decisionAuthority: string;
  email: string;
  timezone: string;
  city: string;
  country: string;
  linkedinUrl: string;
  websiteUrl: string;
  tracxnUrl: string;
  checkSizeMinUsd: string;
  checkSizeMaxUsd: string;
  sectorInterests: string;
  stageInterests: string;
  warmthScore: string;
  introPath: string;
  bioSummary: string;
  fitRationale: string;
};

const EMPTY_CREATE_FORM: CreateForm = {
  firmName: '',
  firmType: 'vc',
  firstName: '',
  lastName: '',
  title: 'Partner',
  decisionAuthority: 'full',
  email: '',
  timezone: 'Asia/Kolkata',
  city: '',
  country: '',
  linkedinUrl: '',
  websiteUrl: '',
  tracxnUrl: '',
  checkSizeMinUsd: '',
  checkSizeMaxUsd: '',
  sectorInterests: '',
  stageInterests: '',
  warmthScore: '',
  introPath: '',
  bioSummary: '',
  fitRationale: '',
};

function buildCreatePayload(f: CreateForm): Record<string, unknown> {
  const out: Record<string, unknown> = {
    firmName: f.firmName.trim(),
    firmType: f.firmType,
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    title: f.title.trim(),
    decisionAuthority: f.decisionAuthority.trim(),
    email: f.email.trim(),
    timezone: f.timezone.trim(),
  };
  const s = (k: keyof CreateForm) => {
    const v = (f[k] as string).trim();
    if (v) out[k] = v;
  };
  const n = (k: keyof CreateForm) => {
    const v = (f[k] as string).trim();
    if (v && !Number.isNaN(Number(v))) out[k] = Number(v);
  };
  const a = (k: keyof CreateForm) => {
    const arr = (f[k] as string)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (arr.length > 0) out[k] = arr;
  };
  s('city');
  s('country');
  s('linkedinUrl');
  s('websiteUrl');
  s('tracxnUrl');
  n('checkSizeMinUsd');
  n('checkSizeMaxUsd');
  a('sectorInterests');
  a('stageInterests');
  n('warmthScore');
  s('introPath');
  s('bioSummary');
  s('fitRationale');
  return out;
}

function CreateInvestorModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/admin/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildCreatePayload(form)),
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/40 bg-white shadow-[0_40px_100px_-30px_rgba(91,33,182,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
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
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
          {err ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          ) : null}

          <CreateGroup title="Firm">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateField
                label="Firm name"
                value={form.firmName}
                onChange={(v) => set('firmName', v)}
                required
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Firm type</span>
                <select
                  value={form.firmType}
                  onChange={(e) => set('firmType', e.target.value)}
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
          </CreateGroup>

          <CreateGroup title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateField
                label="First name"
                value={form.firstName}
                onChange={(v) => set('firstName', v)}
                required
              />
              <CreateField
                label="Last name"
                value={form.lastName}
                onChange={(v) => set('lastName', v)}
                required
              />
              <CreateField
                label="Title"
                value={form.title}
                onChange={(v) => set('title', v)}
                required
              />
              <CreateField
                label="Decision authority"
                value={form.decisionAuthority}
                onChange={(v) => set('decisionAuthority', v)}
                required
              />
              <CreateField
                label="Email"
                value={form.email}
                onChange={(v) => set('email', v)}
                type="email"
                required
              />
              <CreateField
                label="Timezone"
                value={form.timezone}
                onChange={(v) => set('timezone', v)}
                required
              />
            </div>
          </CreateGroup>

          <CreateGroup title="Location">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateField label="City" value={form.city} onChange={(v) => set('city', v)} />
              <CreateField
                label="Country"
                value={form.country}
                onChange={(v) => set('country', v)}
              />
            </div>
          </CreateGroup>

          <CreateGroup title="Social / external">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateField
                label="LinkedIn URL"
                value={form.linkedinUrl}
                onChange={(v) => set('linkedinUrl', v)}
              />
              <CreateField
                label="Website"
                value={form.websiteUrl}
                onChange={(v) => set('websiteUrl', v)}
              />
              <CreateField
                label="Tracxn URL"
                value={form.tracxnUrl}
                onChange={(v) => set('tracxnUrl', v)}
              />
            </div>
          </CreateGroup>

          <CreateGroup title="Investment signals">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreateField
                label="Check size min (USD)"
                type="number"
                value={form.checkSizeMinUsd}
                onChange={(v) => set('checkSizeMinUsd', v)}
              />
              <CreateField
                label="Check size max (USD)"
                type="number"
                value={form.checkSizeMaxUsd}
                onChange={(v) => set('checkSizeMaxUsd', v)}
              />
              <CreateField
                label="Sector interests (comma-sep)"
                value={form.sectorInterests}
                onChange={(v) => set('sectorInterests', v)}
              />
              <CreateField
                label="Stage interests (comma-sep)"
                value={form.stageInterests}
                onChange={(v) => set('stageInterests', v)}
              />
              <CreateField
                label="Warmth score (0-100)"
                type="number"
                value={form.warmthScore}
                onChange={(v) => set('warmthScore', v)}
              />
              <CreateField
                label="Intro path"
                value={form.introPath}
                onChange={(v) => set('introPath', v)}
              />
            </div>
          </CreateGroup>

          <CreateGroup title="Notes">
            <CreateTextarea
              label="Bio summary (partner background)"
              value={form.bioSummary}
              onChange={(v) => set('bioSummary', v)}
            />
            <CreateTextarea
              label="Fit rationale (why this investor fits OotaOS)"
              value={form.fitRationale}
              onChange={(v) => set('fitRationale', v)}
            />
          </CreateGroup>

          <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/40 transition hover:-translate-y-px disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save investor
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function CreateGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-700">
        {title}
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function CreateField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
    </label>
  );
}

function CreateTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
    </label>
  );
}
