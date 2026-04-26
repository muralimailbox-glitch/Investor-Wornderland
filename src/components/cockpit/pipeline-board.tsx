'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Loader2, TrendingUp } from 'lucide-react';

import {
  StagePromptModal,
  type StagePromptKind,
  type StagePromptResult,
} from '@/components/cockpit/stage-prompt-modal';

type Investor = { id: string; firstName: string; lastName: string; email: string };
type Firm = { id: string; name: string; firmType: string };
type Lead = {
  id: string;
  stage: string;
  updatedAt: string;
  thesisFitScore: number | null;
  nextActionOwner?: string | null;
  nextActionDue?: string | null;
};
type Row = { investor: Investor; firm: Firm; lead: Lead | null };

const STAGES_REQUIRING_NEXT_ACTION = new Set([
  'engaged',
  'nda_pending',
  'nda_signed',
  'meeting_scheduled',
  'diligence',
  'term_sheet',
]);

const STAGES: { key: string; label: string; accent: string; glow: string }[] = [
  {
    key: 'prospect',
    label: 'Prospect',
    accent: 'from-slate-500 to-slate-600',
    glow: 'shadow-slate-500/20',
  },
  {
    key: 'contacted',
    label: 'Contacted',
    accent: 'from-sky-500 to-sky-600',
    glow: 'shadow-sky-500/20',
  },
  {
    key: 'engaged',
    label: 'Engaged',
    accent: 'from-indigo-500 to-indigo-600',
    glow: 'shadow-indigo-500/20',
  },
  {
    key: 'nda_pending',
    label: 'NDA pending',
    accent: 'from-amber-500 to-amber-600',
    glow: 'shadow-amber-500/20',
  },
  {
    key: 'nda_signed',
    label: 'NDA signed',
    accent: 'from-violet-500 to-violet-600',
    glow: 'shadow-violet-500/20',
  },
  {
    key: 'meeting_scheduled',
    label: 'Meeting',
    accent: 'from-fuchsia-500 to-fuchsia-600',
    glow: 'shadow-fuchsia-500/20',
  },
  {
    key: 'diligence',
    label: 'Diligence',
    accent: 'from-blue-500 to-blue-600',
    glow: 'shadow-blue-500/20',
  },
  {
    key: 'term_sheet',
    label: 'Term sheet',
    accent: 'from-emerald-500 to-emerald-600',
    glow: 'shadow-emerald-500/20',
  },
  {
    key: 'funded',
    label: 'Funded',
    accent: 'from-emerald-600 to-teal-600',
    glow: 'shadow-emerald-500/30',
  },
  {
    key: 'closed_lost',
    label: 'Closed lost',
    accent: 'from-rose-500 to-rose-600',
    glow: 'shadow-rose-500/20',
  },
];

export function PipelineBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  /** Mobile-only filter: pick a single stage when the kanban won't fit. */
  const [mobileStage, setMobileStage] = useState<string>('all');

  async function load() {
    try {
      const r = await fetch('/api/v1/admin/investors?pageSize=100', { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = (await r.json()) as { rows: Row[] };
      setRows(d.rows.filter((row) => row.lead !== null));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const stage of STAGES) map[stage.key] = [];
    for (const row of rows) {
      if (row.lead) {
        const bucket = map[row.lead.stage];
        if (bucket) bucket.push(row);
      }
    }
    return map;
  }, [rows]);

  type Pending = {
    leadId: string;
    nextStage: string;
    investorName: string;
    kind: StagePromptKind;
  };
  const [prompt, setPrompt] = useState<Pending | null>(null);

  function attemptTransition(leadId: string, nextStage: string) {
    const row = rows.find((r) => r.lead?.id === leadId);
    if (!row || !row.lead) return;
    if (row.lead.stage === nextStage) return;
    const investorName = `${row.investor.firstName} ${row.investor.lastName}`;

    if (nextStage === 'closed_lost') {
      setPrompt({ leadId, nextStage, investorName, kind: 'closed_lost' });
      return;
    }
    if (nextStage === 'funded') {
      setPrompt({ leadId, nextStage, investorName, kind: 'funded' });
      return;
    }
    if (
      STAGES_REQUIRING_NEXT_ACTION.has(nextStage) &&
      (!row.lead.nextActionOwner || !row.lead.nextActionDue)
    ) {
      setPrompt({ leadId, nextStage, investorName, kind: 'next_action' });
      return;
    }
    void runTransition(leadId, nextStage, {});
  }

  async function runTransition(leadId: string, nextStage: string, extra: Record<string, unknown>) {
    setPendingId(leadId);
    const snapshot = rows;
    setRows((prev) =>
      prev.map((r) =>
        r.lead?.id === leadId ? { ...r, lead: { ...r.lead, stage: nextStage } } : r,
      ),
    );
    try {
      const res = await fetch('/api/v1/admin/pipeline/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ leadId, nextStage, ...extra }),
      });
      if (!res.ok) {
        let detail: string | null = null;
        try {
          const j = (await res.json()) as { title?: string; detail?: string };
          detail = j.title ?? j.detail ?? null;
        } catch {
          /* ignore */
        }
        throw new Error(detail ?? `${res.status}`);
      }
    } catch (e) {
      setRows(snapshot);
      setErr(e instanceof Error ? e.message : 'transition_failed');
    } finally {
      setPendingId(null);
    }
  }

  async function handlePromptSubmit(p: Pending, result: StagePromptResult) {
    const extra: Record<string, unknown> = {};
    if (result.kind === 'next_action') {
      extra.nextActionOwner = result.nextActionOwner;
      extra.nextActionDue = result.nextActionDue;
    } else if (result.kind === 'closed_lost') {
      extra.closedLostReason = result.closedLostReason;
    } else if (result.kind === 'funded') {
      extra.fundedAmountUsd = result.fundedAmountUsd;
      extra.fundedAt = result.fundedAt;
    }
    setPrompt(null);
    await runTransition(p.leadId, p.nextStage, extra);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
            Pipeline
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Where every lead stands
          </h1>
          <p className="text-[15px] text-slate-600">
            Drag cards between stages to advance the round.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-violet-700 shadow-sm ring-1 ring-violet-100">
          <TrendingUp className="h-3.5 w-3.5" />
          {rows.length} active leads
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-60 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading pipeline
        </div>
      ) : (
        <>
          {/* Mobile-only stage filter so the founder can focus one column at a time. */}
          <div className="flex items-center gap-2 lg:hidden">
            <label className="text-xs font-medium text-slate-600">Stage:</label>
            <select
              value={mobileStage}
              onChange={(e) => setMobileStage(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="all">All stages (scroll)</option>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({(grouped[s.key] ?? []).length})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-6">
            {STAGES.filter((s) => mobileStage === 'all' || mobileStage === s.key).map((stage) => {
              const items = grouped[stage.key] ?? [];
              const isOver = overStage === stage.key && dragId !== null;
              return (
                <div
                  key={stage.key}
                  className={`flex w-72 flex-none flex-col gap-3 rounded-3xl border p-3 transition ${
                    isOver
                      ? 'border-violet-400 bg-violet-50 shadow-lg shadow-violet-500/10'
                      : 'border-slate-200 bg-white'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage.key);
                  }}
                  onDragLeave={() => setOverStage((cur) => (cur === stage.key ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    const leadId = e.dataTransfer.getData('text/plain');
                    if (leadId && leadId !== dragId) return;
                    if (leadId) {
                      const row = rows.find((r) => r.lead?.id === leadId);
                      if (row && row.lead && row.lead.stage !== stage.key) {
                        attemptTransition(leadId, stage.key);
                      }
                    }
                    setDragId(null);
                  }}
                >
                  <div className="flex items-center justify-between px-2 py-1">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${stage.accent} px-3 py-1 text-xs font-semibold text-white shadow ${stage.glow}`}
                    >
                      {stage.label}
                    </div>
                    <span className="text-xs font-medium text-slate-500">{items.length}</span>
                  </div>
                  <div className="flex min-h-[60px] flex-col gap-2">
                    {items.length === 0 ? (
                      <div className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
                        empty
                      </div>
                    ) : (
                      items.map((row, idx) => (
                        <motion.div
                          key={row.lead!.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(0.02 * idx, 0.25) }}
                        >
                          <div
                            draggable
                            onDragStart={(e) => {
                              setDragId(row.lead!.id);
                              e.dataTransfer.setData('text/plain', row.lead!.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setOverStage(null);
                            }}
                            className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md ${
                              pendingId === row.lead!.id ? 'opacity-60' : ''
                            } ${dragId === row.lead!.id ? 'rotate-1 cursor-grabbing' : ''}`}
                          >
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.investor.firstName} {row.investor.lastName}
                            </p>
                            <p className="truncate text-xs text-slate-500">{row.firm.name}</p>
                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                              <span>{new Date(row.lead!.updatedAt).toLocaleDateString()}</span>
                              {row.lead!.thesisFitScore != null ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">
                                  fit {row.lead!.thesisFitScore}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <ChevronRight className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Tip: drag cards to advance stages.
            </p>
            <p className="text-sm text-slate-600">
              Closed-lost asks for a reason; Funded asks for amount + date; engaged onward asks for
              a next-action owner & due date. Every transition is audit-logged.
            </p>
          </div>
        </div>
      </div>

      {prompt ? (
        <StagePromptModal
          kind={prompt.kind}
          investorName={prompt.investorName}
          targetStage={prompt.nextStage}
          onCancel={() => setPrompt(null)}
          onSubmit={(result) => handlePromptSubmit(prompt, result)}
        />
      ) : null}
    </div>
  );
}
