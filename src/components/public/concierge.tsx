'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Quote, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

type Citation = { section: string; version: string; similarity: number };
type Turn = { id: string; role: 'user' | 'assistant'; text: string; citations?: Citation[]; pending?: boolean };

const SUGGESTED = [
  'What does OotaOS actually do?',
  'Who are the founders?',
  'How much are you raising?',
  'What traction do you have?',
];

export function Concierge({ autofocus = false }: { autofocus?: boolean }) {
  const [sessionId] = useState(() => `sess-${Math.random().toString(36).slice(2, 12)}`);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState('');
  const [streaming, setStreaming] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fieldId = useId();

  useEffect(() => {
    if (autofocus) textareaRef.current?.focus();
  }, [autofocus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

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
              setTurns((prev) =>
                prev.map((t) => (t.id === assistantId ? { ...t, citations, pending: false } : t)),
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
            <Sparkles className="h-3.5 w-3.5" /> Ask the founders anything
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
          Ask Priya
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
          placeholder="Ask Priya anything about OotaOS…"
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
    </div>
  );
}

function TypingDots() {
  return (
    <span aria-live="polite" aria-label="Priya is typing" className="inline-flex items-center gap-1">
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
