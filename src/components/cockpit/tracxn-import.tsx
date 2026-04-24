'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ClipboardPaste, Code2, Loader2, Sparkles, X } from 'lucide-react';

import {
  bulkImportInvestors,
  parseTracxn,
  type FirmDraft,
  type InvestorDraft,
  type TracxnParseResult,
} from '@/lib/api/tracxn';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

type Tab = 'paste' | 'json';

const SAMPLE_JSON = `{
  "firms": [
    {
      "name": "Example Ventures",
      "firmType": "vc",
      "hqCity": "Bengaluru",
      "hqCountry": "India",
      "portfolioCount": 124,
      "topSectorsInPortfolio": ["fintech", "saas"],
      "topEntryRounds": ["seed", "series_a"],
      "dealsLast12Months": 18
    }
  ],
  "investors": [
    {
      "firmName": "Example Ventures",
      "firstName": "Asha",
      "lastName": "Rao",
      "title": "Partner",
      "decisionAuthority": "full",
      "email": "asha@example.vc",
      "timezone": "Asia/Kolkata",
      "sectorInterests": ["fintech", "ai"],
      "stageInterests": ["seed", "series_a"]
    }
  ]
}`;

export function TracxnImportModal({ open, onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('paste');
  const [raw, setRaw] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<TracxnParseResult | null>(null);

  const [jsonText, setJsonText] = useState('');
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ firms: number; investors: number } | null>(null);

  const reset = () => {
    setRaw('');
    setParsed(null);
    setParseErr(null);
    setJsonText('');
    setJsonErr(null);
    setImportErr(null);
    setDone(null);
  };

  async function onParse() {
    if (!raw.trim()) return;
    setParsing(true);
    setParseErr(null);
    setParsed(null);
    try {
      const result = await parseTracxn(raw);
      setParsed(result);
    } catch (e) {
      setParseErr((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function onImportParsed() {
    if (!parsed) return;
    await runImport(parsed.firms, parsed.investors);
  }

  async function onImportJson() {
    setJsonErr(null);
    let payload: { firms?: FirmDraft[]; investors?: InvestorDraft[] };
    try {
      payload = JSON.parse(jsonText) as { firms?: FirmDraft[]; investors?: InvestorDraft[] };
    } catch {
      setJsonErr('Invalid JSON — check brackets/quotes.');
      return;
    }
    if (!payload.investors || !Array.isArray(payload.investors) || payload.investors.length === 0) {
      setJsonErr('JSON must include an "investors" array with at least one row.');
      return;
    }
    await runImport(payload.firms ?? [], payload.investors);
  }

  async function runImport(firms: FirmDraft[], investors: InvestorDraft[]) {
    setImporting(true);
    setImportErr(null);
    try {
      const result = await bulkImportInvestors({ firms, investors });
      setDone({
        firms: result.firmsCreated + result.firmsUpdated,
        investors: result.investorsCreated + result.investorsUpdated,
      });
      onImported();
    } catch (e) {
      setImportErr((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
                Import
              </p>
              <h2 className="text-lg font-semibold text-slate-900">Add from Tracxn</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-4">
            <TabBtn
              active={tab === 'paste'}
              onClick={() => setTab('paste')}
              icon={<ClipboardPaste className="h-4 w-4" />}
            >
              Paste
            </TabBtn>
            <TabBtn
              active={tab === 'json'}
              onClick={() => setTab('json')}
              icon={<Code2 className="h-4 w-4" />}
            >
              JSON endpoint
            </TabBtn>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {done ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <p className="text-lg font-semibold text-emerald-900">Imported.</p>
                <p className="text-sm text-emerald-800">
                  {done.firms} firm{done.firms === 1 ? '' : 's'} and {done.investors} investor
                  {done.investors === 1 ? '' : 's'} are in your book.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => reset()}
                    className="rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                  >
                    Import more
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : tab === 'paste' ? (
              <PasteTab
                raw={raw}
                onRawChange={setRaw}
                onParse={onParse}
                parsing={parsing}
                parseErr={parseErr}
                parsed={parsed}
                onImport={onImportParsed}
                importing={importing}
                importErr={importErr}
              />
            ) : (
              <JsonTab
                jsonText={jsonText}
                onJsonChange={setJsonText}
                onImport={onImportJson}
                importing={importing}
                importErr={importErr}
                jsonErr={jsonErr}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-t-xl border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? 'border-violet-600 text-violet-700'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PasteTab(props: {
  raw: string;
  onRawChange: (v: string) => void;
  onParse: () => void;
  parsing: boolean;
  parseErr: string | null;
  parsed: TracxnParseResult | null;
  onImport: () => void;
  importing: boolean;
  importErr: string | null;
}) {
  const { raw, onRawChange, onParse, parsing, parseErr, parsed, onImport, importing, importErr } =
    props;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Copy a Tracxn firm or investor page, paste below, and Priya will extract the structured
        data. Nothing is saved until you hit <strong>Import</strong>.
      </p>
      <textarea
        value={raw}
        onChange={(e) => onRawChange(e.target.value)}
        placeholder="Paste Tracxn page text here…"
        className="min-h-[220px] resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[13px] leading-relaxed outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
      {parseErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {parseErr}
        </div>
      ) : null}
      {!parsed ? (
        <div className="flex justify-end">
          <button
            onClick={onParse}
            disabled={parsing || !raw.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {parsing ? 'Parsing…' : 'Parse with Priya'}
          </button>
        </div>
      ) : (
        <ParsedPreview
          parsed={parsed}
          onImport={onImport}
          importing={importing}
          importErr={importErr}
        />
      )}
    </div>
  );
}

function ParsedPreview({
  parsed,
  onImport,
  importing,
  importErr,
}: {
  parsed: TracxnParseResult;
  onImport: () => void;
  importing: boolean;
  importErr: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Firms" value={parsed.firms.length} />
        <Stat label="Investors" value={parsed.investors.length} />
        <Stat
          label="Unmatched"
          value={parsed.unmatched.length}
          tone={parsed.unmatched.length > 0 ? 'warn' : 'default'}
        />
      </div>

      {parsed.firms.length > 0 ? (
        <div className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Firms
          </div>
          <div className="divide-y divide-slate-100">
            {parsed.firms.map((f, i) => (
              <div key={`firm-${i}`} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">{f.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[f.firmType ?? 'vc', f.hqCity, f.hqCountry].filter(Boolean).join(' · ')}
                </p>
                {f.portfolioCount || f.dealsLast12Months || f.topSectorsInPortfolio ? (
                  <p className="mt-1 text-xs text-slate-600">
                    {f.portfolioCount ? `${f.portfolioCount} deals` : ''}
                    {f.dealsLast12Months ? ` · ${f.dealsLast12Months} last 12mo` : ''}
                    {f.topSectorsInPortfolio?.length
                      ? ` · top: ${f.topSectorsInPortfolio.slice(0, 3).join(', ')}`
                      : ''}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {parsed.investors.length > 0 ? (
        <div className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Investors
          </div>
          <div className="divide-y divide-slate-100">
            {parsed.investors.map((inv, i) => (
              <div key={`inv-${i}`} className="px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">
                  {inv.firstName} {inv.lastName}{' '}
                  <span className="font-normal text-slate-500">— {inv.title}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {inv.firmName}
                  {inv.email ? ` · ${inv.email}` : ' · (no email — will be skipped on import)'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {parsed.unmatched.length > 0 ? (
        <details className="rounded-2xl border border-amber-200 bg-amber-50">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-900">
            {parsed.unmatched.length} line{parsed.unmatched.length === 1 ? '' : 's'} couldn&apos;t
            be parsed
          </summary>
          <pre className="whitespace-pre-wrap px-4 py-2 text-xs text-amber-900">
            {parsed.unmatched.join('\n\n')}
          </pre>
        </details>
      ) : null}

      {importErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {importErr}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onImport}
          disabled={importing || parsed.investors.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {importing
            ? 'Importing…'
            : `Import ${parsed.investors.length} investor${parsed.investors.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function JsonTab(props: {
  jsonText: string;
  onJsonChange: (v: string) => void;
  onImport: () => void;
  importing: boolean;
  importErr: string | null;
  jsonErr: string | null;
}) {
  const { jsonText, onJsonChange, onImport, importing, importErr, jsonErr } = props;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Post structured firm+investor JSON directly — no AI parse, no tokens consumed. This is what
        Claude co-work uses once it has already extracted the data.
      </p>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Endpoint</span>
        </div>
        <code className="block break-all rounded-lg bg-white px-3 py-2 font-mono text-[12px] text-slate-800">
          POST /api/v1/admin/investors/bulk-import
        </code>
        <p className="mt-2 text-[12px] text-slate-600">
          Requires the founder session cookie. Body is JSON matching{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
            {'{ firms?: FirmDraft[], investors: InvestorDraft[], dryRun?: boolean }'}
          </code>
          .
        </p>
      </div>

      <textarea
        value={jsonText}
        onChange={(e) => onJsonChange(e.target.value)}
        placeholder={SAMPLE_JSON}
        className="min-h-[300px] resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[12px] leading-relaxed outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
      {jsonErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {jsonErr}
        </div>
      ) : null}
      {importErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {importErr}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          onClick={onImport}
          disabled={importing || !jsonText.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {importing ? 'Importing…' : 'Import JSON'}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warn';
}) {
  const bg = tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-violet-50 border-violet-200';
  const fg = tone === 'warn' ? 'text-amber-900' : 'text-violet-900';
  return (
    <div className={`rounded-2xl border ${bg} px-4 py-3`}>
      <p className={`text-xs font-medium uppercase tracking-[0.14em] ${fg}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${fg}`}>{value}</p>
    </div>
  );
}
