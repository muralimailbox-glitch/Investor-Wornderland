'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Inbox as InboxIcon, Loader2, Mail, Send, Sparkles } from 'lucide-react';

type Email = {
  id: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  processedAt: string | null;
};

type Draft = {
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  citations: Array<{ section: string; version: string }>;
  placeholder?: boolean;
};

export function InboxBoard() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/admin/inbox', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as { rows: Email[] };
      })
      .then((d) => {
        if (!alive) return;
        setEmails(d.rows);
        if (d.rows.length > 0 && d.rows[0]) setSelectedId(d.rows[0].id);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selected = emails.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Inbox</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          AI-drafted replies, your voice
        </h1>
        <p className="text-[15px] text-slate-600">
          Every reply starts as a draft. You decide what ships.
        </p>
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            <InboxIcon className="h-3.5 w-3.5" /> {emails.length} messages
          </div>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Mail className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Inbox is quiet.</p>
              <p className="text-xs text-slate-500">Messages from investors will land here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {emails.map((email) => (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => setSelectedId(email.id)}
                  className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition ${
                    selectedId === email.id ? 'bg-violet-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {email.fromEmail}
                    </span>
                    <span className="flex-none text-[10px] text-slate-400">
                      {new Date(email.receivedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="line-clamp-1 text-sm text-slate-700">{email.subject}</span>
                  <span className="line-clamp-1 text-xs text-slate-500">{email.bodyText}</span>
                  {email.processedAt ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> processed
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <AnimatePresence mode="wait">
            {selected ? (
              <EmailDetail key={selected.id} email={selected} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full min-h-[280px] items-center justify-center text-sm text-slate-500"
              >
                Select a message to draft a reply.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function EmailDetail({ email }: { email: Email }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

  async function generate() {
    setGenerating(true);
    setErr(null);
    setSent(false);
    try {
      const res = await fetch('/api/v1/admin/draft/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          inboundEmailId: email.id,
          topic: email.subject,
          context: email.bodyText.slice(0, 4000),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = (await res.json()) as Draft;
      setDraft(d);
      setEditedSubject(d.subject);
      setEditedBody(d.bodyText);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'draft_failed');
    } finally {
      setGenerating(false);
    }
  }

  async function send() {
    if (!draft) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch('/api/v1/admin/draft/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          toEmail: email.fromEmail,
          subject: editedSubject,
          bodyText: editedBody,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'send_failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col"
    >
      <div className="border-b border-slate-100 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          {new Date(email.receivedAt).toLocaleString()}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{email.subject}</h2>
        <p className="mt-1 text-sm text-slate-600">from {email.fromEmail}</p>
      </div>
      <div className="max-h-56 overflow-y-auto border-b border-slate-100 bg-slate-50 px-6 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {email.bodyText}
      </div>

      <div className="flex flex-col gap-3 px-6 py-5">
        {!draft && !generating ? (
          <button
            type="button"
            onClick={generate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px"
          >
            <Sparkles className="h-4 w-4" /> Draft reply with Priya
          </button>
        ) : null}
        {generating ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-violet-50 px-5 py-3 text-sm text-violet-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Priya is drafting…
          </div>
        ) : null}
        {draft ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Subject
              </span>
              <input
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Body
              </span>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={8}
                className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>
            {draft.citations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {draft.citations.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700"
                  >
                    §{c.section}.{c.version}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                <Sparkles className="h-3.5 w-3.5" /> Regenerate
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || sent}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-px disabled:opacity-70"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sent ? 'Sent' : sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
            {sent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                Reply queued and sent via Zoho SMTP.
              </div>
            ) : null}
          </>
        ) : null}
        {err ? <p className="text-sm text-rose-600">{err}</p> : null}
      </div>
    </motion.div>
  );
}
