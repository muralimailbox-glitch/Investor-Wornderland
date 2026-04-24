'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, DollarSign, Loader2, Plus, Save } from 'lucide-react';

import { createDeal, getCurrentDeal, patchDeal, type Deal, type DealCreate } from '@/lib/api/deals';

type Form = {
  roundLabel: string;
  targetSizeUsd: string;
  preMoneyUsd: string;
  postMoneyUsd: string;
  committedUsd: string;
  seedFunded: boolean;
  companyType: string;
  incorporationCountry: string;
  pitchJurisdiction: string;
};

const EMPTY_FORM: Form = {
  roundLabel: 'Seed',
  targetSizeUsd: '',
  preMoneyUsd: '',
  postMoneyUsd: '',
  committedUsd: '0',
  seedFunded: false,
  companyType: 'C-Corp',
  incorporationCountry: 'India',
  pitchJurisdiction: 'India',
};

function formToPayload(form: Form): DealCreate {
  return {
    roundLabel: form.roundLabel.trim(),
    targetSizeUsd: Number(form.targetSizeUsd) || 0,
    preMoneyUsd: form.preMoneyUsd ? Number(form.preMoneyUsd) : null,
    postMoneyUsd: form.postMoneyUsd ? Number(form.postMoneyUsd) : null,
    committedUsd: Number(form.committedUsd) || 0,
    seedFunded: form.seedFunded,
    companyType: form.companyType.trim(),
    incorporationCountry: form.incorporationCountry.trim(),
    pitchJurisdiction: form.pitchJurisdiction.trim(),
  };
}

function dealToForm(d: Deal): Form {
  return {
    roundLabel: d.roundLabel,
    targetSizeUsd: String(d.targetSizeUsd),
    preMoneyUsd: d.preMoneyUsd == null ? '' : String(d.preMoneyUsd),
    postMoneyUsd: d.postMoneyUsd == null ? '' : String(d.postMoneyUsd),
    committedUsd: String(d.committedUsd),
    seedFunded: d.seedFunded,
    companyType: d.companyType,
    incorporationCountry: d.incorporationCountry,
    pitchJurisdiction: d.pitchJurisdiction,
  };
}

export function DealEditor() {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCurrentDeal()
      .then((d) => {
        if (!alive) return;
        if (d) {
          setDeal(d);
          setForm(dealToForm(d));
        }
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = formToPayload(form);
      const result = deal ? await patchDeal(deal.id, payload) : await createDeal(payload);
      setDeal(result);
      setForm(dealToForm(result));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading deal
      </div>
    );
  }

  const progressPct =
    deal && deal.targetSizeUsd > 0
      ? Math.min(100, Math.round((deal.committedUsd / deal.targetSizeUsd) * 100))
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Deal</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
            {deal ? 'Active round' : 'Set up your round'}
          </h1>
          <p className="mt-1 text-[15px] text-slate-600">
            The one source of truth for round size, commitments, and jurisdiction.
          </p>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      {deal ? (
        <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-violet-800">
                {deal.roundLabel}
              </p>
              <p className="mt-1 text-3xl font-semibold text-violet-950">
                ${(deal.committedUsd / 1_000_000).toFixed(2)}M / $
                {(deal.targetSizeUsd / 1_000_000).toFixed(2)}M
              </p>
              <p className="mt-1 text-xs text-violet-800">
                {progressPct}% committed · {deal.incorporationCountry} incorporation
              </p>
            </div>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-violet-700 shadow">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-200/70">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </section>
      ) : null}

      <form
        onSubmit={onSave}
        className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Round label">
            <input
              value={form.roundLabel}
              onChange={(e) => setForm((f) => ({ ...f, roundLabel: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Target size (USD)">
            <input
              type="number"
              value={form.targetSizeUsd}
              onChange={(e) => setForm((f) => ({ ...f, targetSizeUsd: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Pre-money (USD)">
            <input
              type="number"
              value={form.preMoneyUsd}
              onChange={(e) => setForm((f) => ({ ...f, preMoneyUsd: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Post-money (USD)">
            <input
              type="number"
              value={form.postMoneyUsd}
              onChange={(e) => setForm((f) => ({ ...f, postMoneyUsd: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Committed (USD)">
            <input
              type="number"
              value={form.committedUsd}
              onChange={(e) => setForm((f) => ({ ...f, committedUsd: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Seed funded?">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.seedFunded}
                onChange={(e) => setForm((f) => ({ ...f, seedFunded: e.target.checked }))}
              />
              Yes
            </label>
          </Field>
          <Field label="Company type">
            <input
              value={form.companyType}
              onChange={(e) => setForm((f) => ({ ...f, companyType: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Incorporation country">
            <input
              value={form.incorporationCountry}
              onChange={(e) => setForm((f) => ({ ...f, incorporationCountry: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Pitch jurisdiction">
            <input
              value={form.pitchJurisdiction}
              onChange={(e) => setForm((f) => ({ ...f, pitchJurisdiction: e.target.value }))}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3">
          {savedAt ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : deal ? (
              <Save className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : deal ? 'Save deal' : 'Create deal'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
