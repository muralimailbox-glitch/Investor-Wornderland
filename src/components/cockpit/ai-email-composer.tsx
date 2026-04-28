'use client';

/**
 * Single-investor AI email composer.
 *
 * Used inside the activity drawer (compact / collapsible) and the
 * full-page investor detail view (alwaysOpen). Calls /draft/compose
 * with investorIds=[id], renders the resulting subject + body with
 * full provenance, then dispatches via /draft/send.
 */
import { useState } from 'react';
import { CheckCircle2, Loader2, Send, Wand2, X } from 'lucide-react';

export type ComposeIntent =
  | 'intro'
  | 'follow_up'
  | 'share_doc'
  | 'schedule_meeting'
  | 'nudge_after_silence'
  | 'thank_you'
  | 'custom';

export type ComposeProvenance = {
  interactionsConsidered: number;
  sectorsKnown: number;
  portfolioCompaniesKnown: number;
  fitRationaleAvailable: boolean;
  warmthScore: number | null;
  kbChunks: number;
  voiceSamples: number;
};

type Props = {
  investorId: string;
  investorEmail: string;
  investorFirstName: string;
  /**
   * When true, the composer renders open by default with no toggle.
   * Use on full-page surfaces (detail view); the drawer keeps the
   * default false so the composer doesn't compete with the timeline.
   */
  alwaysOpen?: boolean;
  /** Called after a successful send so the parent can refresh the timeline. */
  onSent?: () => void;
};

export function AiEmailComposer({
  investorId,
  investorEmail,
  investorFirstName,
  alwaysOpen = false,
  onSent,
}: Props) {
  const [open, setOpen] = useState(alwaysOpen);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<ComposeIntent>('follow_up');
  const [operatorContext, setOperatorContext] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [provenance, setProvenance] = useState<ComposeProvenance | null>(null);
  const [leadIdForSend, setLeadIdForSend] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  async function draft() {
    setDrafting(true);
    setError(null);
    setProvenance(null);
    try {
      const res = await fetch('/api/v1/admin/draft/compose', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investorIds: [investorId],
          intent,
          tone: 'warm',
          ...(operatorContext.trim() ? { operatorContext: operatorContext.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(`compose failed: ${j?.title ?? res.status}`);
      }
      const { drafts } = (await res.json()) as {
        drafts: Array<{
          leadId: string;
          subject: string;
          body: string;
          firstName: string;
          provenance: ComposeProvenance;
        }>;
      };
      const first = drafts[0];
      if (!first) throw new Error('AI returned no draft');
      setSubject(first.subject);
      // Materialize {{firstName}} since this is a single-investor send —
      // /draft/send doesn't run the per-recipient template substitutions.
      setBody(first.body.replace(/{{firstName}}/g, investorFirstName));
      setProvenance(first.provenance);
      setLeadIdForSend(first.leadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'compose failed');
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!leadIdForSend) {
      setError('No lead resolved — draft first.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/draft/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: investorEmail,
          subject,
          bodyText: body,
          leadId: leadIdForSend,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(`send failed: ${j?.title ?? res.status}`);
      }
      setSentAt(new Date().toISOString());
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'send failed');
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        <Wand2 className="h-3.5 w-3.5" /> Draft email with AI
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-orange-50/50 via-rose-50/30 to-fuchsia-50/30 p-4">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
          <Wand2 className="h-3.5 w-3.5" /> AI compose · {investorFirstName}
        </p>
        {!alwaysOpen ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value as ComposeIntent)}
          className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
        >
          <option value="intro">Intro / cold outbound</option>
          <option value="follow_up">Follow-up</option>
          <option value="share_doc">Share a document</option>
          <option value="schedule_meeting">Ask for a meeting</option>
          <option value="nudge_after_silence">Nudge after silence</option>
          <option value="thank_you">Thank you</option>
          <option value="custom">Custom (use my context)</option>
        </select>
        <button
          type="button"
          onClick={() => void draft()}
          disabled={drafting}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-60"
        >
          {drafting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          {drafting ? 'Drafting…' : 'Draft'}
        </button>
      </div>

      <textarea
        value={operatorContext}
        onChange={(e) => setOperatorContext(e.target.value)}
        placeholder="Optional context — e.g. 'we just closed a customer at Foodlink', 'saw their bet on Mysa'"
        rows={2}
        className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
      />

      {provenance ? (
        <p className="mt-2 text-[11px] text-slate-600">
          Drafted with <span className="font-semibold">{provenance.interactionsConsidered}</span>{' '}
          past interactions ·{' '}
          <span className="font-semibold">{provenance.portfolioCompaniesKnown}</span> portfolio
          companies · <span className="font-semibold">{provenance.voiceSamples}</span> voice samples
          {provenance.fitRationaleAvailable ? ' · fit rationale ✓' : ''}
        </p>
      ) : null}

      {(subject || body) && !sentAt ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={alwaysOpen ? 12 : 8}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[12px] leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !subject.trim() || !body.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? 'Sending…' : `Send to ${investorEmail}`}
          </button>
        </div>
      ) : null}

      {sentAt ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Sent at {new Date(sentAt).toLocaleString()}
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}
