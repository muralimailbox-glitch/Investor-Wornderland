'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import { getInvestorActivity, type InvestorActivity } from '@/lib/api/investor-activity';

type Props = {
  investorId: string;
  onClose: () => void;
};

const TOPIC_LABELS: Record<string, string> = {
  financials: 'Financials',
  cap_table: 'Cap table',
  terms: 'Deal terms',
  customers: 'Customers',
  ip: 'IP / moat',
  team_comp: 'Team comp',
  roadmap_detail: 'Roadmap detail',
};

export function InvestorActivityDrawer({ investorId, onClose }: Props) {
  const [data, setData] = useState<InvestorActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    // The drawer is keyed by investorId at the call site, so this effect runs
    // exactly once per mount — no need to reset loading/error at the top.
    let alive = true;
    getInvestorActivity(investorId)
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
    return () => {
      alive = false;
    };
  }, [investorId]);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.aside
        key="panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Activity
            </p>
            {data ? (
              <>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  {data.investor.firstName} {data.investor.lastName}
                </h2>
                <p className="text-xs text-slate-500">{data.investor.email}</p>
              </>
            ) : (
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                Loading activity…
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : data ? (
            <div className="flex flex-col gap-6">
              <SummaryCard data={data} />
              <Timeline interactions={data.interactions} />
            </div>
          ) : null}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function SummaryCard({ data }: { data: InvestorActivity }) {
  const verified = Boolean(data.investor.emailVerifiedAt);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-fuchsia-50/70 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">
        <Sparkles className="h-3.5 w-3.5" /> What they&apos;re curious about
      </div>
      {data.summary.topTopics.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {data.summary.topTopics.map((t) => (
            <span
              key={t.topic}
              className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-violet-900"
            >
              {TOPIC_LABELS[t.topic] ?? t.topic.replace(/_/g, ' ')}
              <span className="text-violet-500">×{t.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          No deep-dive topics yet — they&apos;re still scanning the surface.
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-slate-600">
        <div>
          <p className="uppercase tracking-[0.12em] text-slate-400">Questions asked</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-900">
            {data.summary.questionsAsked}
          </p>
        </div>
        <div>
          <p className="uppercase tracking-[0.12em] text-slate-400">Email verified</p>
          <p
            className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold ${
              verified ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {verified ? (
              <>
                <ShieldCheck className="h-4 w-4" /> Yes
              </>
            ) : (
              'Not yet'
            )}
          </p>
        </div>
      </div>
      {data.summary.refusedCount > 0 ? (
        <p className="text-[11px] text-amber-700">
          {data.summary.refusedCount} question{data.summary.refusedCount === 1 ? '' : 's'} hit a
          gate or refusal — consider reaching out proactively.
        </p>
      ) : null}
    </section>
  );
}

function Timeline({ interactions }: { interactions: InvestorActivity['interactions'] }) {
  if (interactions.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">
        <Activity className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        No interactions recorded yet. Activity appears here as they explore the wonderland.
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Timeline
      </p>
      <ol className="flex flex-col gap-3">
        {interactions.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <KindIcon kind={item.kind} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{labelForKind(item.kind)}</p>
                <p className="text-[11px] text-slate-400">{formatRelative(item.createdAt)}</p>
              </div>
              <InteractionBody kind={item.kind} payload={item.payload} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const cls =
    'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-violet-50 text-violet-700';
  switch (kind) {
    case 'question_asked':
      return (
        <span className={cls}>
          <MessageSquare className="h-4 w-4" />
        </span>
      );
    case 'email_verified':
      return (
        <span className={cls}>
          <CheckCircle2 className="h-4 w-4" />
        </span>
      );
    case 'email_sent':
    case 'email_received':
      return (
        <span className={cls}>
          <Mail className="h-4 w-4" />
        </span>
      );
    case 'document_viewed':
      return (
        <span className={cls}>
          <FileText className="h-4 w-4" />
        </span>
      );
    default:
      return (
        <span className={cls}>
          <Activity className="h-4 w-4" />
        </span>
      );
  }
}

function labelForKind(kind: string): string {
  switch (kind) {
    case 'question_asked':
      return 'Asked Priya a question';
    case 'email_verified':
      return 'Verified email';
    case 'email_sent':
      return 'We sent them an email';
    case 'email_received':
      return 'They emailed us';
    case 'document_viewed':
      return 'Opened a document';
    case 'meeting_held':
      return 'Meeting held';
    case 'stage_change':
      return 'Stage changed';
    case 'page_view':
      return 'Page view';
    case 'note':
      return 'Note';
    default:
      return kind.replace(/_/g, ' ');
  }
}

function InteractionBody({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  if (kind === 'question_asked') {
    const question = typeof payload.question === 'string' ? (payload.question as string) : null;
    const topics = Array.isArray(payload.depthTopics) ? (payload.depthTopics as string[]) : [];
    const trust = typeof payload.trust === 'string' ? (payload.trust as string) : null;
    const refused = payload.refused === true;
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        {question ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
            “{question}”
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {topics.map((t) => (
            <span
              key={t}
              className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-800"
            >
              {TOPIC_LABELS[t] ?? t.replace(/_/g, ' ')}
            </span>
          ))}
          {trust ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              trust: {trust.replace(/_/g, ' ')}
            </span>
          ) : null}
          {refused ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              concierge refused
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  if (kind === 'email_verified') {
    const email = typeof payload.email === 'string' ? (payload.email as string) : null;
    const updated = payload.emailUpdated === true;
    return (
      <p className="mt-1 text-[13px] text-slate-700">
        {updated ? (
          <>
            Updated their email on file to{' '}
            <span className="font-medium text-slate-900">{email ?? 'a new address'}</span>.
          </>
        ) : (
          <>Confirmed ownership of {email ?? 'their email'}.</>
        )}
      </p>
    );
  }
  if (kind === 'note') {
    const text = typeof payload.text === 'string' ? (payload.text as string) : null;
    return text ? (
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{text}</p>
    ) : null;
  }
  return null;
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
