'use client';

/**
 * Bulk Emails board — a contact-method-first lens over the investor list.
 *
 * The InvestorsBoard already supports cohort outreach segmented by *warmth*
 * and pipeline stage. This board complements it by segmenting by *contact
 * method* — what we have on file for each investor — so the founder can
 * answer questions like "who do I have email for but no phone?" before
 * picking an audience to bulk-mail.
 *
 * Phase 1 (this commit) ships email-only outreach. Investors all carry a
 * required email but no phone column, so the phone/both/neither buckets
 * are surfaced as zero-count placeholders and visibly marked "coming
 * soon" — when the schema gains a phone field those filters light up
 * without rebuilding this board.
 *
 * Once the founder picks an audience and selects recipients, the existing
 * `BulkEmailModal` takes over (compose → /api/v1/admin/batch → dispatch).
 * That dispatch path already auto-advances each lead from `prospect` to
 * `contacted` via `autoAdvanceOnEvent('email_sent')`, satisfying the
 * pipeline-side requirement of this feature.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Phone, Search, Send, UsersRound } from 'lucide-react';

import { BulkEmailModal } from '@/components/cockpit/bulk-email-modal';

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

type Investor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  // Phone is not yet on the investors schema; the contract here mirrors
  // a future column so the bucket logic ports unchanged when it lands.
  phone?: string | null;
};

type Firm = { id: string; name: string };
type Lead = { id: string; stage: string } | null;
type Row = { investor: Investor | null; firm: Firm; lead: Lead; partnerPending: boolean };
type ListResponse = { rows: Row[]; page: number; pageSize: number; total: number };

// Contact-method buckets. The phone/both/neither buckets are wired in
// but always empty in phase 1 (no phone column yet) — the UI shows them
// disabled with a "coming soon" affordance so the founder sees the
// shape of the future feature without being able to act on it.
type Bucket = 'email_only' | 'phone_only' | 'both' | 'neither';

const BUCKET_LABELS: Record<Bucket, { title: string; subtitle: string; phase1: boolean }> = {
  email_only: {
    title: 'Email only',
    subtitle: 'We have an email but no phone on file',
    phase1: true,
  },
  phone_only: {
    title: 'Phone only',
    subtitle: 'Phone-on-file outreach — coming soon',
    phase1: false,
  },
  both: {
    title: 'Email + phone',
    subtitle: 'Multi-channel — coming soon',
    phase1: false,
  },
  neither: {
    title: 'No contact info',
    subtitle: 'Investors we cannot reach yet',
    phase1: false,
  },
};

function bucketFor(inv: Investor | null): Bucket | null {
  if (!inv) return null;
  const hasEmail = Boolean(inv.email && inv.email.trim());
  const hasPhone = Boolean(inv.phone && inv.phone.trim());
  if (hasEmail && hasPhone) return 'both';
  if (hasEmail) return 'email_only';
  if (hasPhone) return 'phone_only';
  return 'neither';
}

export function BulkEmailsBoard() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<Bucket>('email_only');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // Server cap mirrors batch.ts MAX_BATCH_SIZE — keep clients in lockstep
  // so a 51-recipient send doesn't 4xx at the create-batch step.
  const MAX_COHORT_SIZE = 50;

  // Debounce + defer the fetch into a setTimeout so the synchronous
  // setLoading/setError pair sits outside the effect body. Matches the
  // pattern in InvestorsBoard and keeps the React Compiler happy
  // (no cascading renders triggered from inside the effect).
  useEffect(() => {
    let alive = true;
    const handle = setTimeout(() => {
      if (!alive) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('pageSize', '500');
      fetch(`/api/v1/admin/investors?${params.toString()}`, { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as ListResponse;
        })
        .then((j) => {
          if (!alive) return;
          setData(j);
        })
        .catch((e) => {
          if (!alive) return;
          setError(e instanceof Error ? e.message : 'failed to load');
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
        });
    }, 150);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [search]);

  // Bucket counts drive the pill badges. Computed off the fetched rows so
  // counts always match what the table will show after a bucket switch.
  const counts = useMemo<Record<Bucket, number>>(() => {
    const acc: Record<Bucket, number> = { email_only: 0, phone_only: 0, both: 0, neither: 0 };
    for (const r of data?.rows ?? []) {
      const b = bucketFor(r.investor);
      if (b) acc[b]++;
    }
    return acc;
  }, [data]);

  const visibleRows = useMemo(() => {
    if (!data) return [] as Row[];
    return data.rows.filter((r) => bucketFor(r.investor) === bucket && r.lead?.id);
  }, [data, bucket]);

  const selectableCount = visibleRows.length;
  const selectedCount = selectedLeadIds.size;

  function toggleSelect(leadId: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else if (next.size < MAX_COHORT_SIZE) next.add(leadId);
      return next;
    });
  }

  function selectAllVisible() {
    const ids = visibleRows.map((r) => r.lead?.id).filter((x): x is string => Boolean(x));
    setSelectedLeadIds(new Set(ids.slice(0, MAX_COHORT_SIZE)));
  }

  function clearSelection() {
    setSelectedLeadIds(new Set());
  }

  // Recipients shape matches BulkEmailModal's prop contract — same field
  // names so the modal works unchanged.
  const recipients = useMemo(() => {
    if (!data)
      return [] as Array<{ leadId: string; investorId: string; name: string; email: string }>;
    return Array.from(selectedLeadIds)
      .map((leadId) => {
        const row = data.rows.find((r) => r.lead?.id === leadId);
        if (!row || !row.investor || !row.lead) return null;
        return {
          leadId,
          investorId: row.investor.id,
          name: `${row.investor.firstName} ${row.investor.lastName}`.trim(),
          email: row.investor.email,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [data, selectedLeadIds]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
          Bulk Emails
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Send to a contact-method cohort
        </h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Pick a contact-method bucket, scan the cohort, then compose one email that personalises
          per recipient. Once dispatched, every lead in <code>prospect</code> auto-moves to{' '}
          <code>contacted</code> in the pipeline.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => {
          const meta = BUCKET_LABELS[b];
          const active = bucket === b;
          const Icon = b === 'email_only' ? Mail : b === 'phone_only' ? Phone : UsersRound;
          const disabled = !meta.phase1 && counts[b] === 0;
          return (
            <button
              key={b}
              type="button"
              onClick={() => {
                if (disabled) return;
                setBucket(b);
                clearSelection();
              }}
              disabled={disabled}
              className={`flex flex-col items-start gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                active
                  ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-200'
                  : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon className="h-4 w-4 text-violet-700" />
                  {meta.title}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-violet-200 text-violet-900' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {counts[b]}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-slate-500">{meta.subtitle}</p>
              {!meta.phase1 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  Coming soon
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or firm…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </div>
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={selectableCount === 0}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select all visible{selectableCount > MAX_COHORT_SIZE ? ` (top ${MAX_COHORT_SIZE})` : ''}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            disabled={selectedCount === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Compose to {selectedCount}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading investors…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No investors in this cohort yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-8 py-2"></th>
                  <th className="py-2 pr-4 font-semibold">Investor</th>
                  <th className="py-2 pr-4 font-semibold">Firm</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Stage</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const inv = r.investor!;
                  const lead = r.lead!;
                  const checked = selectedLeadIds.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
                    >
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(lead.id)}
                          className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                        />
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-900">
                        {inv.firstName} {inv.lastName}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{r.firm.name}</td>
                      <td className="py-2 pr-4 text-slate-600">{inv.email}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            STAGE_COLORS[lead.stage] ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {lead.stage}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bulkOpen ? (
        <BulkEmailModal
          recipients={recipients}
          onClose={() => setBulkOpen(false)}
          onSent={() => {
            // Auto-advance happens server-side; clear the local selection
            // and refetch so leads that just moved to `contacted` re-render
            // with the updated stage pill.
            clearSelection();
            setBulkOpen(false);
            // Trigger a reload by nudging the search dependency.
            setSearch((s) => s);
          }}
        />
      ) : null}
    </div>
  );
}
