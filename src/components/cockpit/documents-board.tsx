'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, UploadCloud } from 'lucide-react';

import {
  deleteDocument,
  listDocuments,
  uploadDocument,
  type DocumentKind,
  type DocumentRow,
  type LeadStage,
  type WatermarkPolicy,
} from '@/lib/api/documents';

const KIND_OPTIONS: Array<{ value: DocumentKind; label: string }> = [
  { value: 'pitch_deck', label: 'Pitch deck' },
  { value: 'financial_model', label: 'Financial model' },
  { value: 'customer_refs', label: 'Customer refs' },
  { value: 'tech_arch', label: 'Tech architecture' },
  { value: 'cap_table', label: 'Cap table' },
  { value: 'product_demo', label: 'Product demo' },
  { value: 'term_sheet', label: 'Term sheet' },
  { value: 'other', label: 'Other' },
];

const WATERMARK_OPTIONS: Array<{ value: WatermarkPolicy; label: string }> = [
  { value: 'per_investor', label: 'Per investor (recommended)' },
  { value: 'static', label: 'Static watermark' },
  { value: 'none', label: 'No watermark' },
];

const STAGE_GATE_OPTIONS: Array<{ value: LeadStage | ''; label: string }> = [
  { value: '', label: 'No gate — visible after NDA (default)' },
  { value: 'engaged', label: 'Engaged or later' },
  { value: 'nda_signed', label: 'NDA signed (most cap tables, term sheets)' },
  { value: 'meeting_scheduled', label: 'After meeting scheduled' },
  { value: 'diligence', label: 'In diligence or later' },
  { value: 'term_sheet', label: 'Term sheet or later' },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsBoard() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [kind, setKind] = useState<DocumentKind>('pitch_deck');
  const [title, setTitle] = useState('');
  const [watermark, setWatermark] = useState<WatermarkPolicy>('per_investor');
  const [minLeadStage, setMinLeadStage] = useState<LeadStage | ''>('');
  const [expiresDays, setExpiresDays] = useState<number | ''>('');
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDocuments();
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const args: Parameters<typeof uploadDocument>[0] = {
        file,
        kind,
        watermarkPolicy: watermark,
      };
      if (title) args.title = title;
      if (expiresDays !== '') args.expiresInDays = Number(expiresDays);
      if (minLeadStage) args.minLeadStage = minLeadStage;
      await uploadDocument(args);
      setTitle('');
      setExpiresDays('');
      setMinLeadStage('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload_failed');
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this document? Investors will no longer see it.')) return;
    setDeletingId(id);
    try {
      await deleteDocument(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete_failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl border border-violet-100 bg-white/90 p-6 shadow-[0_20px_60px_-30px_rgba(91,33,182,0.35)]">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Upload a document</h2>
        <p className="mt-1 text-sm text-slate-500">
          PDFs, decks, spreadsheets. Up to 50 MB. Per-investor watermarks are applied at download
          time.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Title (optional)
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Seed deck — v4"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Kind
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DocumentKind)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Watermark policy
            </span>
            <select
              value={watermark}
              onChange={(e) => setWatermark(e.target.value as WatermarkPolicy)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {WATERMARK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Expires in (days, optional)
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="30"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Visible from stage (rule #10)
            </span>
            <select
              value={minLeadStage}
              onChange={(e) => setMinLeadStage(e.target.value as LeadStage | '')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {STAGE_GATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400">
              Sensitive docs (cap table, financial model, term sheet) commonly gate at &quot;NDA
              signed&quot;. Investors at earlier stages get a 403 if they try to fetch.
            </span>
          </label>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition ${
            dragOver
              ? 'border-violet-400 bg-violet-50'
              : 'border-slate-200 bg-slate-50 hover:border-violet-300'
          }`}
        >
          <input
            type="file"
            onChange={(e) => void onFiles(e.target.files)}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
              <p className="mt-3 text-sm text-slate-500">Uploading…</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-7 w-7 text-violet-500" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                Drop a file or click to select
              </p>
              <p className="mt-1 text-xs text-slate-400">PDF, deck, sheet — max 50 MB</p>
            </>
          )}
        </label>

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Data room</h2>
          <span className="text-xs text-slate-500">
            {loading ? 'Loading…' : `${rows.length} document${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.length === 0 && !loading ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No documents yet. Upload a pitch deck to share with NDA-signed investors.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Kind</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Watermark</th>
                  <th className="px-4 py-3 text-left">Expires</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.title ?? r.originalFilename}
                      <div className="text-xs text-slate-400">{r.originalFilename}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.kind.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-600">{formatBytes(r.sizeBytes)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.watermarkPolicy.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.expiresAt
                        ? new Date(r.expiresAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void onDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
