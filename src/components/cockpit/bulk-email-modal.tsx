'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Loader2, Mail, Send, Sparkles, X } from 'lucide-react';

type Recipient = { leadId: string; investorId: string; name: string; email: string };

type ComposeIntent =
  | 'intro'
  | 'follow_up'
  | 'share_doc'
  | 'schedule_meeting'
  | 'nudge_after_silence'
  | 'thank_you'
  | 'custom';

type ComposeTone = 'warm' | 'formal' | 'concise';

type ComposeDraft = {
  leadId: string;
  firstName: string;
  firmName: string | null;
  subject: string;
  body: string;
  provenance: {
    interactionsConsidered: number;
    sectorsKnown: number;
    portfolioCompaniesKnown: number;
    fitRationaleAvailable: boolean;
    warmthScore: number | null;
    kbChunks: number;
    voiceSamples: number;
  };
};

type Props = {
  recipients: Recipient[];
  onClose: () => void;
  onSent: (sent: number, failed: number) => void;
};

const TEMPLATE_OPTIONS = [
  { value: '', label: 'Custom (use subject + body below)' },
  { value: 'outreach', label: 'Cold outreach' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'meeting_invite', label: 'Meeting invite' },
  { value: 'lounge_invite', label: 'Lounge invite' },
  { value: 'nda_sent', label: 'NDA welcome' },
  { value: 'update', label: 'Investor update' },
  { value: 'thank_you', label: 'Thank you' },
];

const DEFAULT_BODY = `Hi {{firstName}},

I'd love to share an update on OotaOS — we're a restaurant operating system raising $800K seed at $8M post. Your personalized link is below; ask Olivia anything and the data room opens after a 60-second mutual NDA.

{{investorLink}}

Best,
Murali`;

export function BulkEmailModal({ recipients, onClose, onSent }: Props) {
  const [templateKey, setTemplateKey] = useState<string>('outreach');
  const [subject, setSubject] = useState('OotaOS — quick intro');
  const [body, setBody] = useState(DEFAULT_BODY);
  const [phase, setPhase] = useState<'compose' | 'review' | 'sending' | 'done' | 'error'>(
    'compose',
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  // AI-compose state. We hit /api/v1/admin/draft/compose with the visible
  // recipients + an intent + an optional operator-supplied context blob,
  // then drop the model's first draft into the subject/body fields. The
  // founder edits and dispatches as normal.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiIntent, setAiIntent] = useState<ComposeIntent>('intro');
  const [aiTone, setAiTone] = useState<ComposeTone>('warm');
  const [aiContext, setAiContext] = useState('');
  const [aiProvenance, setAiProvenance] = useState<ComposeDraft['provenance'] | null>(null);

  // Real-time critique. Debounced 1.2s after the founder stops typing in
  // body or subject; results render as pills above the body textarea.
  type Issue = { kind: string; severity: 'info' | 'warn' | 'error'; message: string };
  const [issues, setIssues] = useState<Issue[]>([]);
  const [critiqueBusy, setCritiqueBusy] = useState(false);
  const critiqueAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== 'compose' || body.trim().length < 50) {
      // Don't refetch; the conditional render below already hides pills
      // when the body is too short, so we avoid the set-state-in-effect
      // lint while still keeping the UI quiet for short drafts.
      return;
    }
    const handle = setTimeout(() => {
      // Cancel any in-flight critique before firing the next one — only the
      // latest call's result wins, so a fast typist doesn't see stale pills.
      critiqueAbortRef.current?.abort();
      const controller = new AbortController();
      critiqueAbortRef.current = controller;
      setCritiqueBusy(true);
      fetch('/api/v1/admin/draft/critique', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          subject,
          body,
          ...(recipients[0]?.leadId ? { leadId: recipients[0].leadId } : {}),
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as { issues: Issue[] };
        })
        .then((j) => {
          if (controller.signal.aborted) return;
          setIssues(j.issues ?? []);
        })
        .catch(() => {
          // Silent — critique is advisory, never blocking.
        })
        .finally(() => {
          if (!controller.signal.aborted) setCritiqueBusy(false);
        });
    }, 1200);
    return () => clearTimeout(handle);
  }, [phase, subject, body, recipients]);

  async function composeWithAI() {
    setAiBusy(true);
    setAiError(null);
    setAiProvenance(null);
    try {
      // Cap the request to the first 5 leads so the model has time to write
      // each one well. The first draft drives the visible subject/body —
      // dispatch then personalises tokens per recipient on the server.
      const leadIds = recipients.slice(0, 5).map((r) => r.leadId);
      const res = await fetch('/api/v1/admin/draft/compose', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds,
          intent: aiIntent,
          tone: aiTone,
          ...(aiContext.trim() ? { operatorContext: aiContext.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          title?: string;
          detail?: string;
        } | null;
        throw new Error(`compose failed: HTTP ${res.status} — ${j?.title ?? 'unknown'}`);
      }
      const { drafts } = (await res.json()) as { drafts: ComposeDraft[] };
      const first = drafts[0];
      if (!first || !first.body) throw new Error('AI returned no draft');
      // Token-ise so each recipient gets a personalised line. The server's
      // batch service handles the {{...}} substitutions per lead.
      const tokenised = first.body
        .replace(new RegExp(first.firstName, 'g'), '{{firstName}}')
        .replace(/\{\{firstName\}\}\{\{firstName\}\}/g, '{{firstName}}');
      setSubject(first.subject || subject);
      setBody(`${tokenised}\n\n{{investorLink}}`);
      setTemplateKey(''); // switch to "Custom" mode so the founder's text is sent verbatim
      setAiProvenance(first.provenance);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'compose failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function dispatch() {
    setPhase('sending');
    setError(null);
    try {
      // Step 1: create the batch (drafts queued, not yet sent).
      const createRes = await fetch('/api/v1/admin/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: recipients.map((r) => r.leadId),
          subject,
          bodyText: body,
          ...(templateKey ? { templateKey } : {}),
        }),
      });
      if (!createRes.ok) {
        const j = (await createRes.json().catch(() => null)) as {
          title?: string;
          detail?: string;
          stackHead?: string;
        } | null;
        // problemJson writes the error code into `title` and (under
        // DEBUG_API_ERRORS) writes a contextual message into `detail`.
        // Surface both so the founder sees the failing stage immediately.
        const codeTail = j?.title ? ` — ${j.title}` : '';
        const detailTail = j?.detail ? `\n${j.detail}` : '';
        throw new Error(
          `create failed: HTTP ${createRes.status}${codeTail}${detailTail}${j?.stackHead ? `\n${j.stackHead}` : ''}`,
        );
      }
      const { batchId } = (await createRes.json()) as { batchId: string };

      // Step 2: dispatch the batch — this is the human-approved send action
      // (rule #11 satisfied via founder click).
      const dispatchRes = await fetch(`/api/v1/admin/batch/${batchId}/dispatch`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!dispatchRes.ok) {
        const j = (await dispatchRes.json().catch(() => null)) as {
          title?: string;
          detail?: string;
          stackHead?: string;
        } | null;
        const codeTail = j?.title ? ` — ${j.title}` : '';
        const detailTail = j?.detail ? `\n${j.detail}` : '';
        throw new Error(
          `dispatch failed: HTTP ${dispatchRes.status}${codeTail}${detailTail}${j?.stackHead ? `\n${j.stackHead}` : ''}`,
        );
      }
      const r = (await dispatchRes.json()) as { sent: number; failed: number };
      setResult(r);
      setPhase('done');
      onSent(r.sent, r.failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
      setPhase('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Bulk email
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              Send to {recipients.length} investor{recipients.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-slate-500">
              Each recipient gets a personalized magic link. Founder approval = your click below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'compose' || phase === 'review' ? (
          <div className="mt-4 flex flex-col gap-3">
            {/* AI compose panel — generates a draft grounded in the recipient's
              interaction history, sector focus, fit rationale, and Tracxn
              portfolio. Result drops into the subject + body fields below
              for the founder to edit and dispatch. */}
            <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/60 via-rose-50/40 to-fuchsia-50/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
                  <Sparkles className="h-3.5 w-3.5" /> Compose with AI
                </p>
                <button
                  type="button"
                  onClick={() => void composeWithAI()}
                  disabled={aiBusy || recipients.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aiBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {aiBusy ? 'Drafting…' : 'Draft this'}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={aiIntent}
                  onChange={(e) => setAiIntent(e.target.value as ComposeIntent)}
                  className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                  aria-label="Compose intent"
                >
                  <option value="intro">Intro / cold outbound</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="share_doc">Share a document</option>
                  <option value="schedule_meeting">Ask for a meeting</option>
                  <option value="nudge_after_silence">Nudge after silence</option>
                  <option value="thank_you">Thank you</option>
                  <option value="custom">Custom (use my context)</option>
                </select>
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value as ComposeTone)}
                  className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                  aria-label="Compose tone"
                >
                  <option value="warm">Tone: warm</option>
                  <option value="formal">Tone: formal</option>
                  <option value="concise">Tone: concise</option>
                </select>
              </div>
              <textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Optional context to weave in — recent news, mutual connection, hook from their portfolio…"
                rows={2}
                className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
              />
              {aiError ? (
                <p className="mt-2 text-[11px] text-rose-700">{aiError}</p>
              ) : aiProvenance ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  Drafted with{' '}
                  <span className="font-semibold">{aiProvenance.interactionsConsidered}</span> past
                  interactions · <span className="font-semibold">{aiProvenance.sectorsKnown}</span>{' '}
                  sectors ·{' '}
                  <span className="font-semibold">{aiProvenance.portfolioCompaniesKnown}</span>{' '}
                  portfolio companies ·{' '}
                  <span className="font-semibold">{aiProvenance.kbChunks}</span> KB chunks ·{' '}
                  <span className="font-semibold">{aiProvenance.voiceSamples}</span> voice samples
                  {aiProvenance.fitRationaleAvailable ? ' · fit rationale ✓' : ''}
                  {aiProvenance.warmthScore != null ? ` · warmth ${aiProvenance.warmthScore}` : ''}
                </p>
              ) : null}
            </div>

            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Template
              <select
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>

            {issues.length > 0 && body.trim().length >= 50 ? (
              <div className="flex flex-col gap-1.5">
                {issues.map((i, idx) => {
                  const Icon =
                    i.severity === 'error'
                      ? AlertCircle
                      : i.severity === 'warn'
                        ? AlertTriangle
                        : Info;
                  const tone =
                    i.severity === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-800'
                      : i.severity === 'warn'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700';
                  return (
                    <div
                      key={`${i.kind}-${idx}`}
                      className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${tone}`}
                    >
                      <Icon className="mt-0.5 h-3 w-3 flex-none" />
                      <span>{i.message}</span>
                    </div>
                  );
                })}
              </div>
            ) : critiqueBusy ? (
              <p className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" /> Reviewing draft…
              </p>
            ) : null}

            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Body
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
              <span className="text-[10px] text-slate-400">
                Tokens: {'{{firstName}}'}, {'{{firmName}}'}, {'{{investorLink}}'}
              </span>
            </label>

            <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium">
                Recipients ({recipients.length})
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {recipients.map((r) => (
                  <li key={r.leadId} className="flex items-center justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="text-slate-400">{r.email}</span>
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void dispatch()}
                disabled={!subject.trim() || !body.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> Approve & send to {recipients.length}
              </button>
            </div>
          </div>
        ) : phase === 'sending' ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-sm text-slate-600">
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            <p>
              Dispatching {recipients.length} email{recipients.length === 1 ? '' : 's'}…
            </p>
            <p className="text-xs text-slate-400">
              Each recipient gets a personalized magic link; leads auto-advance to “contacted”.
            </p>
          </div>
        ) : phase === 'done' && result ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <Mail className="h-5 w-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium">
                  Sent {result.sent} of {recipients.length}.
                </p>
                {result.failed > 0 ? (
                  <p className="text-xs text-rose-700">
                    {result.failed} failed — check the inbox tab.
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white"
            >
              Close
            </button>
          </div>
        ) : phase === 'error' ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed">
                {error}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setPhase('compose')}
                className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm text-white"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
