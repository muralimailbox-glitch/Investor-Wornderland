'use client';

/**
 * Per-investor activity intelligence — what they searched, what AI told
 * them, what documents they viewed, and the chronological full timeline.
 *
 * The founder uses this surface to:
 *   - audit AI relevance ("did Olivia answer their cap-table question
 *     well?")
 *   - spot disinterest signals ("they viewed 3 docs and asked nothing
 *     for 2 weeks")
 *   - tune the system ("Hot ≥80 investors keep getting refused on
 *     financials — bump the depth gate")
 *
 * Data comes from /api/v1/admin/investors/:id/interactions which
 * already returns summary + full interactions array. No new endpoint
 * needed; this is purely a richer render.
 */
import { useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Handshake,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Workflow,
} from 'lucide-react';

import type { InvestorActivity } from '@/lib/api/investor-activity';

type Interaction = InvestorActivity['interactions'][number];

type QuestionPayload = {
  question?: string;
  answerPreview?: string;
  answerLength?: number;
  answerTruncated?: boolean;
  depthTopics?: string[];
  citations?: string[];
  trust?: 'casual' | 'email_verified' | 'nda_signed';
  refused?: boolean;
  refusalReason?: string | null;
  model?: string;
  sessionId?: string;
  gate?: { needsEmailVerify?: boolean; needsNda?: boolean; topics?: string[] };
};

type DocPayload = { documentId?: string; filename?: string };

type EmailPayload = {
  fromEmail?: string;
  toEmail?: string;
  subject?: string;
  messageId?: string | null;
};

type NotePayload = {
  channel?: string;
  direction?: 'inbound' | 'outbound';
  body?: string;
  occurredAt?: string;
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

const TRUST_LABELS: Record<string, { label: string; cls: string }> = {
  casual: { label: 'Anonymous', cls: 'bg-slate-100 text-slate-600' },
  email_verified: { label: 'Email verified', cls: 'bg-amber-50 text-amber-800' },
  nda_signed: { label: 'NDA signed', cls: 'bg-violet-100 text-violet-700' },
};

export function InvestorIntelligence({ activity }: { activity: InvestorActivity | null }) {
  if (!activity) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Activity loading…</p>
      </section>
    );
  }

  // Bucket the interactions for the per-type sub-views. Keep the full
  // chronological list separately for the timeline at the bottom.
  const questions: Interaction[] = [];
  const docViews: Interaction[] = [];
  const emails: Interaction[] = [];
  const notes: Interaction[] = [];
  const milestones: Interaction[] = [];
  for (const it of activity.interactions) {
    if (it.kind === 'question_asked') questions.push(it);
    else if (it.kind === 'document_viewed') docViews.push(it);
    else if (it.kind === 'email_sent' || it.kind === 'email_received') emails.push(it);
    else if (it.kind === 'note') notes.push(it);
    else milestones.push(it);
  }

  const totalEmails = emails.length;
  const inboundEmails = emails.filter((e) => e.kind === 'email_received').length;
  const outboundEmails = totalEmails - inboundEmails;
  const refusalRate =
    activity.summary.questionsAsked > 0
      ? Math.round((activity.summary.refusedCount / activity.summary.questionsAsked) * 100)
      : 0;

  return (
    <section className="flex flex-col gap-6">
      {/* Summary metrics */}
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Questions asked"
          value={String(activity.summary.questionsAsked)}
          hint={
            activity.summary.lastQuestionAt
              ? `last on ${new Date(activity.summary.lastQuestionAt).toLocaleDateString()}`
              : 'never'
          }
          Icon={MessageSquare}
        />
        <Metric
          label="AI refusals"
          value={`${activity.summary.refusedCount} (${refusalRate}%)`}
          hint={
            refusalRate > 30
              ? 'High — investor hits gates often'
              : refusalRate > 0
                ? 'Some questions gated'
                : 'No gating'
          }
          Icon={ShieldX}
          tone={refusalRate > 30 ? 'warn' : refusalRate > 0 ? 'info' : 'ok'}
        />
        <Metric
          label="Documents viewed"
          value={String(docViews.length)}
          hint={`${
            new Set(docViews.map((d) => (d.payload as DocPayload).documentId ?? '')).size
          } unique`}
          Icon={FileText}
        />
        <Metric
          label="Emails exchanged"
          value={String(totalEmails)}
          hint={`${outboundEmails} out · ${inboundEmails} in`}
          Icon={Mail}
        />
      </div>

      {/* Top topics */}
      {activity.summary.topTopics.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Top topics asked
          </p>
          <p className="mt-1 text-xs text-slate-500">
            What this investor probes most. Use to tune which docs you surface and which prompt
            sections need depth.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activity.summary.topTopics.map((t) => (
              <span
                key={t.topic}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-3 py-1 text-xs font-medium text-rose-800"
              >
                {TOPIC_LABELS[t.topic] ?? t.topic.replace(/_/g, ' ')}
                <span className="rounded-full bg-white/70 px-1.5 text-[10px]">×{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Q&A log — primary intelligence surface */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Questions & AI answers
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Click any question to see what the investor asked and what Olivia returned.
            </p>
          </div>
          <span className="text-[11px] text-slate-400">{questions.length} total</span>
        </div>
        <ul className="mt-4 flex flex-col gap-2">
          {questions.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
              No questions yet. The investor hasn&apos;t asked Olivia anything.
            </li>
          ) : (
            questions.map((q) => <QuestionRow key={q.id} interaction={q} />)
          )}
        </ul>
      </div>

      {/* Documents viewed */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Documents accessed
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Every magic-link fetch on a data-room document is logged here with the original
              filename.
            </p>
          </div>
          <span className="text-[11px] text-slate-400">{docViews.length} fetches</span>
        </div>
        {docViews.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs text-slate-500">
            No document views yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {docViews.slice(0, 30).map((d) => {
              const p = d.payload as DocPayload;
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                >
                  <span className="inline-flex items-center gap-2 truncate text-slate-700">
                    <ArrowDownToLine className="h-3 w-3 flex-none text-violet-500" />
                    <span className="truncate font-medium">{p.filename ?? 'Document'}</span>
                  </span>
                  <span className="flex-none text-[11px] text-slate-500">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Milestones (NDA, email verify, stage changes, meetings) */}
      {milestones.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Milestones
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {milestones.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
              >
                <span className="inline-flex items-center gap-2">
                  <MilestoneIcon kind={m.kind} />
                  <span className="font-medium">{labelForMilestone(m.kind)}</span>
                </span>
                <span className="flex-none text-[11px] text-emerald-700">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Email + offline notes timeline */}
      {emails.length + notes.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Communications
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-xs">
            {[...emails, ...notes]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 30)
              .map((c) => (
                <CommRow key={c.id} interaction={c} />
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function Metric({
  label,
  value,
  hint,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  Icon: typeof MessageSquare;
  tone?: 'ok' | 'warn' | 'info';
}) {
  const accent =
    tone === 'warn'
      ? 'text-amber-700'
      : tone === 'ok'
        ? 'text-emerald-700'
        : tone === 'info'
          ? 'text-sky-700'
          : 'text-slate-900';
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
      <Icon className={`mt-0.5 h-4 w-4 ${accent}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {label}
        </p>
        <p className={`mt-0.5 text-lg font-semibold ${accent}`}>{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

function QuestionRow({ interaction }: { interaction: Interaction }) {
  const [open, setOpen] = useState(false);
  const p = interaction.payload as QuestionPayload;
  const trustMeta = p.trust ? TRUST_LABELS[p.trust] : null;
  const refused = Boolean(p.refused);
  const topics = (p.depthTopics ?? []).map((t) => TOPIC_LABELS[t] ?? t);

  return (
    <li
      className={`overflow-hidden rounded-xl border ${
        refused ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
        ) : (
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {p.question ?? '(no question text)'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-500">
              {new Date(interaction.createdAt).toLocaleString()}
            </span>
            {trustMeta ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${trustMeta.cls}`}
              >
                {trustMeta.label}
              </span>
            ) : null}
            {refused ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                gated
              </span>
            ) : null}
            {topics.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-slate-200 bg-slate-50/40 px-4 py-3 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            What Olivia returned
            {p.answerLength != null ? ` · ${p.answerLength} chars total` : ''}
            {p.model ? ` · ${p.model}` : ''}
          </p>
          {refused ? (
            <p className="mt-1 rounded-lg bg-amber-100 px-3 py-2 text-amber-900">
              <strong>Refused.</strong>{' '}
              {p.refusalReason ??
                'AI declined. Likely the depth-gate fired (NDA needed for sensitive topic).'}
            </p>
          ) : (
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-slate-700">
              {p.answerPreview && p.answerPreview.length > 0 ? (
                <>
                  {p.answerPreview}
                  {p.answerTruncated ? (
                    <span className="ml-1 text-[10px] text-slate-400">…[truncated]</span>
                  ) : null}
                </>
              ) : (
                <span className="italic text-slate-400">
                  No answer preview stored. Pre-2026-04-28 questions don&apos;t carry the answer
                  body.
                </span>
              )}
            </p>
          )}
          {(p.citations ?? []).length > 0 ? (
            <p className="mt-2 text-[11px] text-slate-600">
              <strong>Cited:</strong> {(p.citations ?? []).join(' · ')}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400 italic">
              No citations — answer was ungrounded.
            </p>
          )}
          {p.gate?.needsEmailVerify || p.gate?.needsNda ? (
            <p className="mt-2 text-[11px] text-slate-600">
              <strong>Gate state:</strong>{' '}
              {p.gate?.needsEmailVerify ? 'email-verify required · ' : ''}
              {p.gate?.needsNda ? 'NDA required · ' : ''}
              {(p.gate?.topics ?? []).join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function CommRow({ interaction }: { interaction: Interaction }) {
  const k = interaction.kind;
  if (k === 'note') {
    const p = interaction.payload as NotePayload;
    return (
      <li className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
        <Phone className="mt-0.5 h-3 w-3 flex-none text-violet-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900">
            {p.channel?.replace(/_/g, ' ') ?? 'note'} · {p.direction ?? 'logged'}
          </p>
          {p.body ? <p className="line-clamp-2 text-[11px] text-slate-600">{p.body}</p> : null}
        </div>
        <span className="flex-none text-[10px] text-slate-500">
          {new Date(interaction.createdAt).toLocaleDateString()}
        </span>
      </li>
    );
  }
  const p = interaction.payload as EmailPayload;
  const inbound = k === 'email_received';
  return (
    <li className="flex items-start gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
      <Mail
        className={`mt-0.5 h-3 w-3 flex-none ${inbound ? 'text-emerald-600' : 'text-violet-500'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">
          {inbound ? '↩ ' : '↗ '}
          {p.subject ?? '(no subject)'}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          {inbound ? `from ${p.fromEmail ?? ''}` : `to ${p.toEmail ?? ''}`}
        </p>
      </div>
      <span className="flex-none text-[10px] text-slate-500">
        {new Date(interaction.createdAt).toLocaleString()}
      </span>
    </li>
  );
}

function MilestoneIcon({ kind }: { kind: string }) {
  if (kind === 'email_verified') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />;
  if (kind === 'meeting_held') return <Handshake className="h-3.5 w-3.5 text-emerald-700" />;
  if (kind === 'stage_change') return <Workflow className="h-3.5 w-3.5 text-emerald-700" />;
  if (kind === 'page_view') return <Sparkles className="h-3.5 w-3.5 text-emerald-700" />;
  return <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />;
}

function labelForMilestone(kind: string): string {
  switch (kind) {
    case 'email_verified':
      return 'Email verified';
    case 'meeting_held':
      return 'Meeting held';
    case 'stage_change':
      return 'Lead stage advanced';
    case 'page_view':
      return 'Page view';
    default:
      return kind.replace(/_/g, ' ');
  }
}
