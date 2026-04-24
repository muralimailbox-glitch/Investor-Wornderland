'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';

import { getFirm, patchFirm, type Firm, type FirmPatch } from '@/lib/api/firms';

type Props = {
  firmId: string;
  onClose: () => void;
  onSaved: (firm: Firm) => void;
};

const FIRM_TYPES = ['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate'];

type Form = {
  name: string;
  firmType: string;
  website: string;
  hqCity: string;
  hqCountry: string;
  aumUsd: string;
  activeFund: string;
  fundSizeUsd: string;
  stageFocus: string;
  sectorFocus: string;
  geographyFocus: string;
  chequeMinUsd: string;
  chequeMaxUsd: string;
  leadFollow: string;
  boardSeatPolicy: string;
  portfolioCount: string;
  notablePortfolio: string;
  competitorPortfolio: string;
  notableExits: string;
  decisionSpeed: string;
  logoUrl: string;
  foundedYear: string;
  twitterHandle: string;
  linkedinUrl: string;
  tracxnUrl: string;
  topSectorsInPortfolio: string;
  topLocationsInPortfolio: string;
  topEntryRounds: string;
  dealsLast12Months: string;
};

const EMPTY: Form = {
  name: '',
  firmType: 'vc',
  website: '',
  hqCity: '',
  hqCountry: '',
  aumUsd: '',
  activeFund: '',
  fundSizeUsd: '',
  stageFocus: '',
  sectorFocus: '',
  geographyFocus: '',
  chequeMinUsd: '',
  chequeMaxUsd: '',
  leadFollow: '',
  boardSeatPolicy: '',
  portfolioCount: '',
  notablePortfolio: '',
  competitorPortfolio: '',
  notableExits: '',
  decisionSpeed: '',
  logoUrl: '',
  foundedYear: '',
  twitterHandle: '',
  linkedinUrl: '',
  tracxnUrl: '',
  topSectorsInPortfolio: '',
  topLocationsInPortfolio: '',
  topEntryRounds: '',
  dealsLast12Months: '',
};

function arr(v: string[] | null | undefined): string {
  return (v ?? []).join(', ');
}

function fromFirm(f: Firm): Form {
  return {
    name: f.name,
    firmType: f.firmType,
    website: f.website ?? '',
    hqCity: f.hqCity ?? '',
    hqCountry: f.hqCountry ?? '',
    aumUsd: f.aumUsd == null ? '' : String(f.aumUsd),
    activeFund: f.activeFund ?? '',
    fundSizeUsd: f.fundSizeUsd == null ? '' : String(f.fundSizeUsd),
    stageFocus: arr(f.stageFocus),
    sectorFocus: arr(f.sectorFocus),
    geographyFocus: arr(f.geographyFocus),
    chequeMinUsd: f.chequeMinUsd == null ? '' : String(f.chequeMinUsd),
    chequeMaxUsd: f.chequeMaxUsd == null ? '' : String(f.chequeMaxUsd),
    leadFollow: f.leadFollow ?? '',
    boardSeatPolicy: f.boardSeatPolicy ?? '',
    portfolioCount: f.portfolioCount == null ? '' : String(f.portfolioCount),
    notablePortfolio: arr(f.notablePortfolio),
    competitorPortfolio: arr(f.competitorPortfolio),
    notableExits: arr(f.notableExits),
    decisionSpeed: f.decisionSpeed ?? '',
    logoUrl: f.logoUrl ?? '',
    foundedYear: f.foundedYear == null ? '' : String(f.foundedYear),
    twitterHandle: f.twitterHandle ?? '',
    linkedinUrl: f.linkedinUrl ?? '',
    tracxnUrl: f.tracxnUrl ?? '',
    topSectorsInPortfolio: arr(f.topSectorsInPortfolio),
    topLocationsInPortfolio: arr(f.topLocationsInPortfolio),
    topEntryRounds: arr(f.topEntryRounds),
    dealsLast12Months: f.dealsLast12Months == null ? '' : String(f.dealsLast12Months),
  };
}

function toPatch(f: Form): FirmPatch {
  const s = (v: string) => (v.trim() ? v.trim() : null);
  const n = (v: string) => (v.trim() ? Number(v) : null);
  const a = (v: string) =>
    v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  return {
    name: f.name.trim(),
    firmType: f.firmType,
    website: s(f.website),
    hqCity: s(f.hqCity),
    hqCountry: s(f.hqCountry),
    aumUsd: n(f.aumUsd),
    activeFund: s(f.activeFund),
    fundSizeUsd: n(f.fundSizeUsd),
    stageFocus: a(f.stageFocus),
    sectorFocus: a(f.sectorFocus),
    geographyFocus: a(f.geographyFocus),
    chequeMinUsd: n(f.chequeMinUsd),
    chequeMaxUsd: n(f.chequeMaxUsd),
    leadFollow: s(f.leadFollow),
    boardSeatPolicy: s(f.boardSeatPolicy),
    portfolioCount: n(f.portfolioCount),
    notablePortfolio: a(f.notablePortfolio),
    competitorPortfolio: a(f.competitorPortfolio),
    notableExits: a(f.notableExits),
    decisionSpeed: s(f.decisionSpeed),
    logoUrl: s(f.logoUrl),
    foundedYear: n(f.foundedYear),
    twitterHandle: s(f.twitterHandle),
    linkedinUrl: s(f.linkedinUrl),
    tracxnUrl: s(f.tracxnUrl),
    topSectorsInPortfolio: a(f.topSectorsInPortfolio),
    topLocationsInPortfolio: a(f.topLocationsInPortfolio),
    topEntryRounds: a(f.topEntryRounds),
    dealsLast12Months: n(f.dealsLast12Months),
  };
}

export function FirmEditModal({ firmId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFirm(firmId)
      .then((f) => {
        if (alive) setForm(fromFirm(f));
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [firmId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const updated = await patchFirm(firmId, toPatch(form));
      onSaved(updated);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
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
                Edit
              </p>
              <h2 className="text-lg font-semibold text-slate-900">Firm details</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
            </div>
          ) : (
            <form onSubmit={onSave} className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
              {err ? (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {err}
                </div>
              ) : null}

              <Group title="Identity">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="Name"
                    value={form.name}
                    onChange={(v) => setForm((s) => ({ ...s, name: v }))}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-700">Firm type</span>
                    <select
                      value={form.firmType}
                      onChange={(e) => setForm((s) => ({ ...s, firmType: e.target.value }))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                    >
                      {FIRM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <F
                    label="Website"
                    value={form.website}
                    onChange={(v) => setForm((s) => ({ ...s, website: v }))}
                  />
                  <F
                    label="Logo URL"
                    value={form.logoUrl}
                    onChange={(v) => setForm((s) => ({ ...s, logoUrl: v }))}
                  />
                  <F
                    label="Founded year"
                    type="number"
                    value={form.foundedYear}
                    onChange={(v) => setForm((s) => ({ ...s, foundedYear: v }))}
                  />
                  <F
                    label="HQ city"
                    value={form.hqCity}
                    onChange={(v) => setForm((s) => ({ ...s, hqCity: v }))}
                  />
                  <F
                    label="HQ country"
                    value={form.hqCountry}
                    onChange={(v) => setForm((s) => ({ ...s, hqCountry: v }))}
                  />
                </div>
              </Group>

              <Group title="Fund profile">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="AUM (USD)"
                    type="number"
                    value={form.aumUsd}
                    onChange={(v) => setForm((s) => ({ ...s, aumUsd: v }))}
                  />
                  <F
                    label="Active fund"
                    value={form.activeFund}
                    onChange={(v) => setForm((s) => ({ ...s, activeFund: v }))}
                  />
                  <F
                    label="Fund size (USD)"
                    type="number"
                    value={form.fundSizeUsd}
                    onChange={(v) => setForm((s) => ({ ...s, fundSizeUsd: v }))}
                  />
                  <F
                    label="Cheque min (USD)"
                    type="number"
                    value={form.chequeMinUsd}
                    onChange={(v) => setForm((s) => ({ ...s, chequeMinUsd: v }))}
                  />
                  <F
                    label="Cheque max (USD)"
                    type="number"
                    value={form.chequeMaxUsd}
                    onChange={(v) => setForm((s) => ({ ...s, chequeMaxUsd: v }))}
                  />
                  <F
                    label="Lead / follow"
                    value={form.leadFollow}
                    onChange={(v) => setForm((s) => ({ ...s, leadFollow: v }))}
                  />
                  <F
                    label="Board seat policy"
                    value={form.boardSeatPolicy}
                    onChange={(v) => setForm((s) => ({ ...s, boardSeatPolicy: v }))}
                  />
                  <F
                    label="Decision speed"
                    value={form.decisionSpeed}
                    onChange={(v) => setForm((s) => ({ ...s, decisionSpeed: v }))}
                  />
                </div>
              </Group>

              <Group title="Stated thesis (comma-separated)">
                <F
                  label="Stage focus"
                  value={form.stageFocus}
                  onChange={(v) => setForm((s) => ({ ...s, stageFocus: v }))}
                />
                <F
                  label="Sector focus"
                  value={form.sectorFocus}
                  onChange={(v) => setForm((s) => ({ ...s, sectorFocus: v }))}
                />
                <F
                  label="Geography focus"
                  value={form.geographyFocus}
                  onChange={(v) => setForm((s) => ({ ...s, geographyFocus: v }))}
                />
              </Group>

              <Group title="Portfolio analytics (from Tracxn)">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="Portfolio count"
                    type="number"
                    value={form.portfolioCount}
                    onChange={(v) => setForm((s) => ({ ...s, portfolioCount: v }))}
                  />
                  <F
                    label="Deals last 12 months"
                    type="number"
                    value={form.dealsLast12Months}
                    onChange={(v) => setForm((s) => ({ ...s, dealsLast12Months: v }))}
                  />
                </div>
                <F
                  label="Top sectors in portfolio"
                  value={form.topSectorsInPortfolio}
                  onChange={(v) => setForm((s) => ({ ...s, topSectorsInPortfolio: v }))}
                />
                <F
                  label="Top locations in portfolio"
                  value={form.topLocationsInPortfolio}
                  onChange={(v) => setForm((s) => ({ ...s, topLocationsInPortfolio: v }))}
                />
                <F
                  label="Top entry rounds"
                  value={form.topEntryRounds}
                  onChange={(v) => setForm((s) => ({ ...s, topEntryRounds: v }))}
                />
                <F
                  label="Notable portfolio"
                  value={form.notablePortfolio}
                  onChange={(v) => setForm((s) => ({ ...s, notablePortfolio: v }))}
                />
                <F
                  label="Competitor portfolio"
                  value={form.competitorPortfolio}
                  onChange={(v) => setForm((s) => ({ ...s, competitorPortfolio: v }))}
                />
                <F
                  label="Notable exits"
                  value={form.notableExits}
                  onChange={(v) => setForm((s) => ({ ...s, notableExits: v }))}
                />
              </Group>

              <Group title="Social">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="LinkedIn URL"
                    value={form.linkedinUrl}
                    onChange={(v) => setForm((s) => ({ ...s, linkedinUrl: v }))}
                  />
                  <F
                    label="Twitter handle"
                    value={form.twitterHandle}
                    onChange={(v) => setForm((s) => ({ ...s, twitterHandle: v }))}
                  />
                  <F
                    label="Tracxn URL"
                    value={form.tracxnUrl}
                    onChange={(v) => setForm((s) => ({ ...s, tracxnUrl: v }))}
                  />
                </div>
              </Group>

              <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save firm
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-700">
        {title}
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function F({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
    </label>
  );
}
