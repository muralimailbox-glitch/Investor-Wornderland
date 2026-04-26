'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, CheckCircle2, Loader2, Save, Sparkles, Trash2 } from 'lucide-react';

type Section = {
  section: string;
  version: string;
  chunkCount: number;
  latestCreatedAt: string;
};

const TEMPLATES: { key: string; label: string; hint: string; sample: string }[] = [
  {
    key: 'pitch',
    label: 'Pitch',
    hint: 'The 90-second elevator story investors hear first.',
    sample:
      'OotaOS is the AI-native investor relations platform — one system that runs the entire round...',
  },
  {
    key: 'traction',
    label: 'Traction',
    hint: 'Revenue, users, growth metrics. Hard numbers only.',
    sample:
      'Monthly active deals grew 4.2× in the last two quarters. ARR crossed $1.8M in Q1 2026...',
  },
  {
    key: 'round',
    label: 'Round',
    hint: 'Size, valuation, commitments, close timeline.',
    sample:
      'Raising $5M seed at $25M post. $2M committed from Lightspeed and angels. Closing Q2 2026.',
  },
  {
    key: 'team',
    label: 'Team',
    hint: 'Founders, advisors, the people behind the build.',
    sample:
      'Priya Raman (CEO) led growth at Freshworks. Anand (CTO) was founding engineer at Razorpay...',
  },
  {
    key: 'moat',
    label: 'Moat',
    hint: 'Why this is hard to copy. The defensibility thesis.',
    sample:
      'Every workspace compounds its own knowledge corpus. The AI gets better per founder, not per customer.',
  },
  {
    key: 'market',
    label: 'Market',
    hint: 'TAM, who we sell to, why now.',
    sample:
      'Founders spend 30% of a round managing investors in spreadsheets. That is a $4B pain globally.',
  },
];

type Freshness = {
  lastIndexedAt: string | null;
  ageDays: number | null;
  latestVersion: string | null;
  chunkCount: number;
  stale: boolean;
  severity: 'ok' | 'warn' | 'critical';
};

export function KnowledgeEditor() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<Freshness | null>(null);

  const [activeTemplate, setActiveTemplate] = useState<string>(TEMPLATES[0]?.key ?? 'pitch');
  const [version, setVersion] = useState('1.0.0');
  const [content, setContent] = useState('');

  async function load() {
    try {
      const [r, f] = await Promise.all([
        fetch('/api/v1/admin/knowledge', { credentials: 'include' }),
        fetch('/api/v1/admin/knowledge/freshness', { credentials: 'include' }),
      ]);
      if (!r.ok) throw new Error(`${r.status}`);
      const d = (await r.json()) as { sections: Section[] };
      setSections(d.sections);
      if (f.ok) {
        setFreshness((await f.json()) as Freshness);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function save() {
    if (content.trim().length < 10) {
      setErr('Content must be at least 10 characters.');
      return;
    }
    setSaving(true);
    setErr(null);
    setBanner(null);
    try {
      const res = await fetch('/api/v1/admin/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          section: activeTemplate,
          version,
          content,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? `${res.status}`);
      }
      const result = (await res.json()) as { chunks: number };
      setBanner(`Saved. Priya indexed ${result.chunks} chunks.`);
      setContent('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save_failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSection(section: string, v: string) {
    if (
      !confirm(
        `Delete the "${section}" v${v} section and its chunks? Priya will stop citing it immediately. This can't be undone.`,
      )
    ) {
      return;
    }
    setErr(null);
    setBanner(null);
    try {
      const res = await fetch('/api/v1/admin/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ section, version: v }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? `${res.status}`);
      }
      const result = (await res.json()) as { chunksDeleted: number };
      setBanner(`Deleted ${result.chunksDeleted} chunks from "${section}" v${v}.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'delete_failed');
    }
  }

  const template = TEMPLATES.find((t) => t.key === activeTemplate);
  const existing = sections.find((s) => s.section === activeTemplate);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Knowledge</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          What Priya can answer
        </h1>
        <p className="text-[15px] text-slate-600">
          Write in your own words. Priya grounds every investor answer in these sections.
        </p>
      </div>

      {freshness ? (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 text-xs ${
            freshness.severity === 'critical'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : freshness.severity === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <span className="font-semibold">
            {freshness.lastIndexedAt
              ? freshness.severity === 'ok'
                ? 'KB is fresh'
                : freshness.severity === 'warn'
                  ? 'KB is getting stale'
                  : 'KB has not been refreshed in a while'
              : 'KB has no chunks indexed yet'}
          </span>
          <span className="text-slate-600">
            {freshness.lastIndexedAt
              ? `${freshness.chunkCount} chunks · last indexed ${
                  freshness.ageDays === 0
                    ? 'today'
                    : `${freshness.ageDays} day${freshness.ageDays === 1 ? '' : 's'} ago`
                } (${new Date(freshness.lastIndexedAt).toLocaleString()})`
              : 'Save any section below to seed Priya.'}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => {
          const hasData = sections.some((s) => s.section === t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTemplate(t.key);
                setBanner(null);
                setErr(null);
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTemplate === t.key
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/30'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t.label}
              {hasData ? (
                <CheckCircle2
                  className={`h-3.5 w-3.5 ${activeTemplate === t.key ? 'text-white' : 'text-emerald-600'}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {banner ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          {banner}
        </motion.div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900 capitalize">
              {template?.label} section
            </h2>
            {template ? <p className="text-sm text-slate-600">{template.hint}</p> : null}
          </div>
          <div className="flex flex-col gap-3 px-6 py-5">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Version
              </span>
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                Content
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder={template?.sample}
                className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              />
            </label>
            {err ? <p className="text-sm text-rose-600">{err}</p> : null}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {content.length} chars · will be chunked and embedded
              </span>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? 'Embedding…' : 'Save section'}
              </button>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 p-5">
            <div className="mb-2 flex items-center gap-2 text-violet-700">
              <Sparkles className="h-4 w-4" />
              <p className="text-xs font-medium uppercase tracking-[0.14em]">Retrieval status</p>
            </div>
            {loading ? (
              <p className="text-sm text-slate-500">loading…</p>
            ) : existing ? (
              <>
                <p className="text-2xl font-semibold text-slate-900">{existing.chunkCount}</p>
                <p className="text-xs text-slate-600">
                  chunks indexed · v{existing.version} ·{' '}
                  {new Date(existing.latestCreatedAt).toLocaleDateString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-600">Not yet indexed.</p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              All sections
            </p>
            {sections.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {sections.map((s) => (
                  <li
                    key={`${s.section}-${s.version}`}
                    className="group flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-slate-700 transition hover:bg-rose-50/40"
                  >
                    <span className="capitalize">{s.section}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        v{s.version} · {s.chunkCount}
                      </span>
                      <button
                        type="button"
                        title={`Delete ${s.section} v${s.version}`}
                        onClick={() => void deleteSection(s.section, s.version)}
                        className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
