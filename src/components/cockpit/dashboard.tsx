'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, DollarSign, Eye, Sparkles, TrendingUp, Users } from 'lucide-react';

import { startPreview } from '@/lib/api/preview';

type Props = {
  user: { email: string; role: string };
  deal: {
    id: string;
    roundSizeUsd: number;
    stage: string;
    closeInDays: number | null;
  } | null;
  leadCount: number;
  byStage: Record<string, number>;
};

const STAGE_ORDER = ['prospect', 'engaged', 'nda_signed', 'meeting', 'term_sheet', 'closed'];

function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${amount}`;
}

export function Dashboard({ user, deal, leadCount, byStage }: Props) {
  const greetName = user.email.split('@')[0];
  const roundLabel = deal ? formatUsd(deal.roundSizeUsd) : 'No active deal';
  const closeIn = deal?.closeInDays ?? null;
  const [previewing, setPreviewing] = useState(false);

  const onPreview = async () => {
    setPreviewing(true);
    try {
      const { url } = await startPreview({ returnTo: '/' });
      window.open(url, '_blank', 'noopener');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Cockpit</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Welcome back, {greetName}.
          </h1>
          <p className="text-[15px] text-slate-600">
            Here&apos;s where the round stands and where your attention should go next.
          </p>
        </div>
        <button
          onClick={() => void onPreview()}
          disabled={previewing}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Eye className="h-4 w-4" />
          {previewing ? 'Opening…' : 'Preview wonderland'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Round size"
          value={roundLabel}
          hint={deal ? `${deal.stage.replace(/_/g, ' ')}` : 'Configure in Pipeline'}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Days to close"
          value={closeIn !== null ? `${closeIn}` : '—'}
          hint={closeIn !== null ? `Closing in ${closeIn} days` : 'Set a close target'}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Leads in pipeline"
          value={`${leadCount}`}
          hint={`${byStage.engaged ?? 0} engaged · ${byStage.nda_signed ?? 0} signed`}
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Role"
          value={user.role}
          hint={user.email}
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_40px_80px_-40px_rgba(91,33,182,0.2)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-700">
              Pipeline
            </p>
            <h2 className="text-lg font-semibold text-slate-900">Where every lead stands today</h2>
          </div>
          <Link
            href="/cockpit/pipeline"
            className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 transition hover:text-violet-900"
          >
            Open board <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-0 sm:grid-cols-3 lg:grid-cols-6">
          {STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              className="border-b border-r border-slate-100 px-5 py-5 last:border-r-0"
            >
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                {stage.replace(/_/g, ' ')}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{byStage[stage] ?? 0}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <section className="grid gap-4 lg:grid-cols-2">
        <QuickLink
          href="/cockpit/investors"
          title="Investors"
          description="Browse, import, edit firms and investors"
        />
        <QuickLink
          href="/cockpit/knowledge"
          title="Knowledge"
          description="What Olivia can answer — in your own words"
        />
        <QuickLink
          href="/cockpit/inbox"
          title="Inbox"
          description="AI-drafted replies, review and send"
        />
        <QuickLink
          href="/cockpit/pipeline"
          title="Pipeline"
          description="Move leads between stages, log interactions"
        />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-700">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </motion.div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-violet-700" />
    </Link>
  );
}
