'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  Coffee,
  FileText,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';

import { AiEmailComposer } from '@/components/cockpit/ai-email-composer';
import { getInvestorActivity, type InvestorActivity } from '@/lib/api/investor-activity';

type Channel =
  | 'phone_call'
  | 'whatsapp'
  | 'in_person'
  | 'sms'
  | 'linkedin'
  | 'email_offline'
  | 'other';

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string; Icon: typeof Phone }> = [
  { value: 'phone_call', label: 'Phone call', Icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { value: 'in_person', label: 'In person', Icon: Coffee },
  { value: 'sms', label: 'SMS', Icon: Smartphone },
  { value: 'linkedin', label: 'LinkedIn', Icon: Globe },
  { value: 'email_offline', label: 'Email (off-platform)', Icon: Mail },
  { value: 'other', label: 'Other', Icon: Activity },
];

const CHANNEL_LABEL: Record<Channel, string> = Object.fromEntries(
  CHANNEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<Channel, string>;

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
              <AiEmailComposer
                investorId={data.investor.id}
                investorEmail={data.investor.email}
                investorFirstName={data.investor.firstName}
              />
              <NoteComposer
                investorId={data.investor.id}
                onLogged={(interaction) => {
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          interactions: [interaction, ...prev.interactions],
                        }
                      : prev,
                  );
                }}
              />
              <Timeline interactions={data.interactions} />
            </div>
          ) : null}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

function NoteComposer({
  investorId,
  onLogged,
}: {
  investorId: string;
  onLogged: (i: InvestorActivity['interactions'][number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>('phone_call');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState(''); // datetime-local
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (body.trim().length < 2) {
      setError('Add a quick note (min 2 chars).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        channel,
        direction,
        body: body.trim(),
      };
      if (occurredAt) payload.occurredAt = new Date(occurredAt).toISOString();
      const res = await fetch(`/api/v1/admin/investors/${investorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        interaction: InvestorActivity['interactions'][number];
      };
      onLogged(j.interaction);
      setBody('');
      setOccurredAt('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3 text-sm font-medium text-violet-800 transition hover:border-violet-300 hover:bg-violet-50"
      >
        <Sparkles className="h-4 w-4" />
        Log an offline conversation
        <span className="text-[11px] font-normal text-violet-600">
          (call, WhatsApp, coffee — keeps the timeline complete)
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
          Log a conversation
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Close composer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHANNEL_OPTIONS.map((opt) => {
          const active = opt.value === channel;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChannel(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50'
              }`}
            >
              <Icon className="h-3 w-3" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        {(['outbound', 'inbound'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded-full border px-2.5 py-1 font-medium transition ${
              direction === d
                ? 'border-violet-500 bg-violet-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {d === 'outbound' ? 'I reached out' : 'They reached out'}
          </button>
        ))}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="What did you discuss? e.g. 30-min call — they want diligence access, asked about Sydney pilot timing, will revert by Friday."
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
      />

      <label className="block text-[11px]">
        <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
          When did this happen? (optional — defaults to now)
        </span>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </label>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save to timeline
        </button>
      </div>
    </section>
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
            <KindIcon kind={item.kind} payload={item.payload} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {labelForKind(item.kind, item.payload)}
                </p>
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

function KindIcon({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const cls =
    'flex h-8 w-8 flex-none items-center justify-center rounded-full bg-violet-50 text-violet-700';
  if (kind === 'note' && payload.offline === true) {
    const ch = (payload.channel as Channel) ?? 'other';
    const Icon = CHANNEL_OPTIONS.find((o) => o.value === ch)?.Icon ?? Activity;
    return (
      <span className={cls}>
        <Icon className="h-4 w-4" />
      </span>
    );
  }
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

function labelForKind(kind: string, payload: Record<string, unknown>): string {
  if (kind === 'note' && payload.offline === true) {
    const channel = (payload.channel as Channel) ?? 'other';
    const direction = payload.direction === 'inbound' ? 'inbound' : 'outbound';
    return `${CHANNEL_LABEL[channel] ?? channel} · ${direction}`;
  }
  switch (kind) {
    case 'question_asked':
      return 'Asked Olivia a question';
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
  // Offline conversation log (call, WhatsApp, in person, etc.)
  if (kind === 'note' && payload.offline === true) {
    const channel = typeof payload.channel === 'string' ? (payload.channel as Channel) : 'other';
    const direction = payload.direction === 'inbound' ? 'They reached out' : 'I reached out';
    const body = typeof payload.body === 'string' ? (payload.body as string) : '';
    const occurredAt =
      typeof payload.occurredAt === 'string' ? (payload.occurredAt as string) : null;
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-medium text-violet-800">
            {CHANNEL_LABEL[channel] ?? channel}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{direction}</span>
          {occurredAt ? (
            <span className="text-slate-500">
              ·{' '}
              {new Date(occurredAt).toLocaleString(undefined, {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          ) : null}
        </div>
        {body ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{body}</p>
        ) : null}
      </div>
    );
  }
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

// AI email composer extracted to ./ai-email-composer so the full-page
// investor detail view can reuse the same surface in always-open mode.
