'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Lock, Quote, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { InvestorGateModal } from '@/components/public/investor-gate-modal';

type Citation = { section: string; version: string; similarity: number };
type Gate = { needsEmailVerify: boolean; needsNda: boolean; topics: string[] };
type Turn = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  pending?: boolean;
  gate?: Gate;
  /** Tracks the user's thumbs reaction to this assistant turn. */
  feedback?: 'up' | 'down';
  /** Indexed against the user turn just before for question context. */
  questionAt?: string;
};

const SUGGESTED = [
  'What does OotaOS actually do?',
  'Why now — what changed in the last 18 months?',
  'How is this different from a chatbot?',
  'Who are the founder?',
  'How much are you raising and on what terms?',
  'What does the data room contain?',
  'How do you make money?',
  'What traction do you have?',
  'Who do you compete with?',
  'How do you handle data security?',
];

export function Concierge({ autofocus = false }: { autofocus?: boolean }) {
  const [sessionId] = useState(() => `sess-${Math.random().toString(36).slice(2, 12)}`);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMode, setGateMode] = useState<'email' | 'nda'>('email');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fieldId = useId();

  useEffect(() => {
    if (autofocus) textareaRef.current?.focus();
  }, [autofocus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  async function submitFeedback(turnId: string, rating: 'up' | 'down') {
    setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, feedback: rating } : t)));
    const turn = turns.find((t) => t.id === turnId);
    if (!turn) return;
    // Question = the user turn immediately preceding this assistant turn.
    const idx = turns.findIndex((t) => t.id === turnId);
    const question = idx > 0 ? (turns[idx - 1]?.text ?? '') : '';
    try {
      await fetch('/api/v1/concierge-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          rating,
          question: question.slice(0, 2000),
          answer: turn.text.slice(0, 8000),
        }),
      });
    } catch {
      /* swallow — UI is optimistic */
    }
  }

  async function submit(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    const userId = `u-${crypto.randomUUID()}`;
    const assistantId = `a-${crypto.randomUUID()}`;
    setTurns((prev) => [
      ...prev,
      { id: userId, role: 'user', text: q },
      { id: assistantId, role: 'assistant', text: '', pending: true, citations: [] },
    ]);
    setValue('');
    setStreaming(true);

    try {
      const history = turns
        .filter((t) => !t.pending)
        .slice(-6)
        .map((t) => ({ role: t.role, content: t.text }));

      const res = await fetch('/api/v1/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, sessionId, history }),
      });
      if (!res.body) throw new Error('no stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Parse SSE events, appending deltas to the assistant turn live.
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = frame.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data) as Record<string, unknown>;
            if (event === 'meta' && Array.isArray(payload.citations)) {
              const citations = payload.citations as Citation[];
              const gate = (payload.gate as Gate | undefined) ?? undefined;
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === assistantId
                    ? { ...t, citations, pending: false, ...(gate ? { gate } : {}) }
                    : t,
                ),
              );
            } else if (event === 'delta' && typeof payload.text === 'string') {
              const text = payload.text;
              setTurns((prev) =>
                prev.map((t) => (t.id === assistantId ? { ...t, text: t.text + text, pending: false } : t)),
              );
            } else if (event === 'done') {
              setTurns((prev) => prev.map((t) => (t.id === assistantId ? { ...t, pending: false } : t)));
            }
          } catch {
            // Ignore malformed frames.
          }
        }
      }
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantId
            ? {
                ...t,
                text: 'The concierge is offline for a moment. Drop a note to info@ootaos.com and we will reply fast.',
                pending: false,
              }
            : t,
        ),
      );
      console.error('[concierge]', err);
    } finally {
      setStreaming(false);
      textareaRef.current?.focus();
    }
  }

  return (
    <div className="relative flex w-full flex-col gap-6">
      {turns.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-700/80">
            <Sparkles className="h-3.5 w-3.5" /> Ask the founder anything
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-violet-200 bg-white/70 px-3.5 py-1.5 text-sm text-violet-900 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur transition hover:-translate-y-px hover:border-violet-400 hover:bg-white"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={
                  turn.role === 'user'
                    ? 'ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-[15px] text-white shadow-lg shadow-slate-900/10'
                    : 'mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-violet-100 bg-white/90 px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_18px_40px_-24px_rgba(91,33,182,0.25)] backdrop-blur'
                }
              >
                {turn.role === 'assistant' ? (
                  <div className="flex flex-col gap-3">
                    {turn.text ? (
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                    ) : (
                      <TypingDots />
                    )}
                    {turn.citations && turn.citations.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-violet-700">
                        <Quote className="h-3 w-3" aria-hidden />
                        {turn.citations.map((c) => (
                          <span
                            key={`${c.section}.${c.version}`}
                            className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono"
                          >
                            §{c.section}.{c.version} · {Math.round(c.similarity * 100)}%
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {turn.gate && (turn.gate.needsEmailVerify || turn.gate.needsNda) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGateMode(turn.gate?.needsEmailVerify ? 'email' : 'nda');
                          setGateOpen(true);
                        }}
                        className="mt-1 inline-flex items-center gap-2 self-start rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-800 transition hover:-translate-y-px hover:border-violet-400 hover:bg-violet-100"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        {turn.gate.needsEmailVerify
                          ? 'Verify email to unlock the numbers'
                          : 'Sign the NDA to see the deeper detail'}
                      </button>
                    ) : null}
                    {turn.text && !turn.pending ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                        <span className="mr-1">Was this helpful?</span>
                        <button
                          type="button"
                          onClick={() => void submitFeedback(turn.id, 'up')}
                          disabled={Boolean(turn.feedback) || streaming}
                          className={`rounded-full p-1 transition ${
                            turn.feedback === 'up'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'hover:bg-slate-100 hover:text-slate-700'
                          } disabled:cursor-default`}
                          aria-label="Helpful"
                        >
                          <ThumbsUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitFeedback(turn.id, 'down')}
                          disabled={Boolean(turn.feedback) || streaming}
                          className={`rounded-full p-1 transition ${
                            turn.feedback === 'down'
                              ? 'bg-rose-100 text-rose-700'
                              : 'hover:bg-slate-100 hover:text-slate-700'
                          } disabled:cursor-default`}
                          aria-label="Not helpful"
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </button>
                        {turn.feedback ? (
                          <span className="ml-1 text-[10px] text-slate-500">
                            Thanks — the founder reviews flagged answers daily.
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="relative"
      >
        <label htmlFor={fieldId} className="sr-only">
          Ask Olivia
        </label>
        <textarea
          id={fieldId}
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(value);
            }
          }}
          placeholder="Ask Olivia anything about OotaOS…"
          rows={2}
          className="w-full resize-none rounded-3xl border border-violet-200 bg-white/90 px-5 py-4 pr-14 text-[15px] text-slate-900 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_24px_50px_-32px_rgba(91,33,182,0.35)] outline-none backdrop-blur transition focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
        />
        <button
          type="submit"
          disabled={streaming || value.trim().length < 3}
          aria-label="Send"
          className="absolute right-3 bottom-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>

      {gateOpen ? (
        <InvestorGateModal mode={gateMode} onClose={() => setGateOpen(false)} />
      ) : null}
    </div>
  );
}

function TypingDots() {
  return (
    <span aria-live="polite" aria-label="Olivia is typing" className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-violet-500"
          animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14 }}
        />
      ))}
    </span>
  );
}
