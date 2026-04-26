'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDown,
  Banknote,
  Loader2,
  PieChart,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
} from 'lucide-react';

type Analytics = {
  stages: Array<{ stage: string; count: number }>;
  conversion: Array<{ from: string; to: string; ratio: number }>;
  round: {
    ask: number;
    committed: number;
    funded: number;
    preMoney: number | null;
    postMoney: number | null;
  };
  closedLost: Array<{ reason: string; count: number }>;
  timeInStage: Array<{ stage: string; avgDays: number }>;
  activity30d: {
    questions: number;
    emailSent: number;
    emailReceived: number;
    documentsViewed: number;
    meetingsHeld: number;
    notesLogged: number;
  };
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function pct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

function stageLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AnalyticsBoard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setData(null);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/analytics', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Analytics;
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  if (error)
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );

  if (!data)
    return (
      <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics…
      </div>
    );

  const maxStage = Math.max(...data.stages.map((s) => s.count), 1);
  const maxLost = Math.max(...data.closedLost.map((l) => l.count), 1);
  const askProgress = data.round.ask > 0 ? data.round.committed / data.round.ask : 0;
  const fundedProgress = data.round.ask > 0 ? data.round.funded / data.round.ask : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">
            Founder cockpit
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Funnel &amp; analytics</h1>
          <p className="mt-1 text-sm text-slate-500">
            Where the round actually stands — conversion, $ progress, closed-lost reasons, and the
            last 30 days of investor activity.
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

      {/* $ progress */}
      <section className="overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-rose-50 to-fuchsia-50 px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
              <Target className="h-3.5 w-3.5" /> Round progress
            </p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {fmtUsd(data.round.funded)}{' '}
              <span className="text-base font-medium text-slate-500">funded</span>
            </p>
            <p className="text-sm text-slate-600">
              {fmtUsd(data.round.committed)} committed · target {fmtUsd(data.round.ask)}
            </p>
            {data.round.postMoney ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Pre-money {fmtUsd(data.round.preMoney ?? 0)} · Post-money{' '}
                {fmtUsd(data.round.postMoney)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                <span>Funded</span>
                <span>{pct(fundedProgress)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                  style={{ width: `${Math.min(100, Math.round(fundedProgress * 100))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                <span>Committed</span>
                <span>{pct(askProgress)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600"
                  style={{ width: `${Math.min(100, Math.round(askProgress * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <header className="mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold text-slate-900">Pipeline by stage</h2>
          </header>
          <ul className="space-y-2">
            {data.stages.map((s, i) => {
              const conv = data.conversion[i];
              const widthPct = (s.count / maxStage) * 100;
              return (
                <li key={s.stage}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-900">{stageLabel(s.stage)}</span>
                    <span>
                      {s.count}
                      {conv && conv.from === s.stage && i < data.stages.length - 2 ? (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                          <ArrowDown className="h-3 w-3" />
                          {pct(conv.ratio)} →
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500"
                      style={{ width: `${Math.max(2, widthPct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Closed-lost */}
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <header className="mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-semibold text-slate-900">Closed-lost reasons</h2>
          </header>
          {data.closedLost.length === 0 ? (
            <p className="text-xs text-slate-500">
              No closed-lost yet — when you mark a deal lost we&apos;ll bucket reasons here.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.closedLost.map((l) => {
                const widthPct = (l.count / maxLost) * 100;
                return (
                  <li key={l.reason}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-700">
                      <span className="line-clamp-1 font-medium">{l.reason}</span>
                      <span className="text-slate-500">×{l.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-rose-400"
                        style={{ width: `${Math.max(2, widthPct)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time in stage */}
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <header className="mb-4 flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Avg time in stage (current rows)
            </h2>
          </header>
          <ul className="grid grid-cols-2 gap-3 text-xs">
            {data.timeInStage.length === 0 ? (
              <li className="col-span-2 text-slate-500">No data.</li>
            ) : (
              data.timeInStage.map((t) => (
                <li
                  key={t.stage}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <span className="text-slate-700">{stageLabel(t.stage)}</span>
                  <span className="font-semibold text-slate-900">{t.avgDays}d</span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Activity 30d */}
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <header className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-900">Last 30 days of activity</h2>
          </header>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Stat label="Questions asked" value={data.activity30d.questions} />
            <Stat label="Emails sent" value={data.activity30d.emailSent} />
            <Stat label="Emails received" value={data.activity30d.emailReceived} />
            <Stat label="Documents viewed" value={data.activity30d.documentsViewed} />
            <Stat label="Meetings held" value={data.activity30d.meetingsHeld} />
            <Stat label="Notes logged" value={data.activity30d.notesLogged} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
