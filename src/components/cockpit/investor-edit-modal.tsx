'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';

type InvestorFull = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  decisionAuthority: string;
  email: string;
  mobileE164: string | null;
  linkedinUrl: string | null;
  twitterHandle: string | null;
  timezone: string;
  introPath: string | null;
  personalThesisNotes: string | null;
  photoUrl: string | null;
  city: string | null;
  country: string | null;
  crunchbaseUrl: string | null;
  tracxnUrl: string | null;
  angellistUrl: string | null;
  websiteUrl: string | null;
  checkSizeMinUsd: number | null;
  checkSizeMaxUsd: number | null;
  sectorInterests: string[] | null;
  stageInterests: string[] | null;
  bioSummary: string | null;
  warmthScore: number | null;
  sourceOfLead?: string | null;
  referrerName?: string | null;
};

type Props = {
  investorId: string;
  onClose: () => void;
  onSaved: () => void;
};

type Form = Record<
  keyof Omit<InvestorFull, 'id' | 'sectorInterests' | 'stageInterests'>,
  string
> & {
  sectorInterests: string;
  stageInterests: string;
};

const EMPTY_FORM: Form = {
  firstName: '',
  lastName: '',
  title: '',
  decisionAuthority: 'full',
  email: '',
  mobileE164: '',
  linkedinUrl: '',
  twitterHandle: '',
  timezone: '',
  introPath: '',
  personalThesisNotes: '',
  photoUrl: '',
  city: '',
  country: '',
  crunchbaseUrl: '',
  tracxnUrl: '',
  angellistUrl: '',
  websiteUrl: '',
  checkSizeMinUsd: '',
  checkSizeMaxUsd: '',
  sectorInterests: '',
  stageInterests: '',
  bioSummary: '',
  warmthScore: '',
  sourceOfLead: '',
  referrerName: '',
};

function fromInvestor(inv: InvestorFull): Form {
  return {
    firstName: inv.firstName,
    lastName: inv.lastName,
    title: inv.title,
    decisionAuthority: inv.decisionAuthority,
    email: inv.email,
    mobileE164: inv.mobileE164 ?? '',
    linkedinUrl: inv.linkedinUrl ?? '',
    twitterHandle: inv.twitterHandle ?? '',
    timezone: inv.timezone,
    introPath: inv.introPath ?? '',
    personalThesisNotes: inv.personalThesisNotes ?? '',
    photoUrl: inv.photoUrl ?? '',
    city: inv.city ?? '',
    country: inv.country ?? '',
    crunchbaseUrl: inv.crunchbaseUrl ?? '',
    tracxnUrl: inv.tracxnUrl ?? '',
    angellistUrl: inv.angellistUrl ?? '',
    websiteUrl: inv.websiteUrl ?? '',
    checkSizeMinUsd: inv.checkSizeMinUsd == null ? '' : String(inv.checkSizeMinUsd),
    checkSizeMaxUsd: inv.checkSizeMaxUsd == null ? '' : String(inv.checkSizeMaxUsd),
    sectorInterests: (inv.sectorInterests ?? []).join(', '),
    stageInterests: (inv.stageInterests ?? []).join(', '),
    bioSummary: inv.bioSummary ?? '',
    warmthScore: inv.warmthScore == null ? '' : String(inv.warmthScore),
    sourceOfLead: inv.sourceOfLead ?? '',
    referrerName: inv.referrerName ?? '',
  };
}

function toPatch(f: Form): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const s = (v: string) => (v.trim() ? v.trim() : null);
  const n = (v: string) => (v.trim() ? Number(v) : null);
  patch.firstName = f.firstName.trim();
  patch.lastName = f.lastName.trim();
  patch.title = f.title.trim();
  patch.decisionAuthority = f.decisionAuthority.trim();
  patch.email = f.email.trim();
  patch.timezone = f.timezone.trim();
  patch.mobileE164 = s(f.mobileE164);
  patch.linkedinUrl = s(f.linkedinUrl);
  patch.twitterHandle = s(f.twitterHandle);
  patch.introPath = s(f.introPath);
  patch.personalThesisNotes = s(f.personalThesisNotes);
  patch.photoUrl = s(f.photoUrl);
  patch.city = s(f.city);
  patch.country = s(f.country);
  patch.crunchbaseUrl = s(f.crunchbaseUrl);
  patch.tracxnUrl = s(f.tracxnUrl);
  patch.angellistUrl = s(f.angellistUrl);
  patch.websiteUrl = s(f.websiteUrl);
  patch.checkSizeMinUsd = n(f.checkSizeMinUsd);
  patch.checkSizeMaxUsd = n(f.checkSizeMaxUsd);
  patch.warmthScore = n(f.warmthScore);
  patch.bioSummary = s(f.bioSummary);
  patch.sectorInterests = f.sectorInterests
    .split(',')
    .map((s2) => s2.trim())
    .filter(Boolean);
  patch.stageInterests = f.stageInterests
    .split(',')
    .map((s2) => s2.trim())
    .filter(Boolean);
  if (f.sourceOfLead) patch.sourceOfLead = f.sourceOfLead;
  patch.referrerName = s(f.referrerName);
  return patch;
}

export function InvestorEditModal({ investorId, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/admin/investors/${investorId}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as InvestorFull;
      })
      .then((inv) => {
        if (alive) setForm(fromInvestor(inv));
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [investorId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/admin/investors/${investorId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPatch(form)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? `${res.status}`);
      }
      onSaved();
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
              <h2 className="text-lg font-semibold text-slate-900">Investor details</h2>
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
                    label="First name"
                    value={form.firstName}
                    onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                  />
                  <F
                    label="Last name"
                    value={form.lastName}
                    onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                  />
                  <F
                    label="Title"
                    value={form.title}
                    onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                  />
                  <F
                    label="Decision authority"
                    value={form.decisionAuthority}
                    onChange={(v) => setForm((f) => ({ ...f, decisionAuthority: v }))}
                  />
                  <F
                    label="Email"
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                  />
                  <F
                    label="Mobile (E.164)"
                    value={form.mobileE164}
                    onChange={(v) => setForm((f) => ({ ...f, mobileE164: v }))}
                  />
                  <F
                    label="Photo URL"
                    value={form.photoUrl}
                    onChange={(v) => setForm((f) => ({ ...f, photoUrl: v }))}
                  />
                  <F
                    label="Timezone"
                    value={form.timezone}
                    onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
                  />
                </div>
              </Group>

              <Group title="Location">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="City"
                    value={form.city}
                    onChange={(v) => setForm((f) => ({ ...f, city: v }))}
                  />
                  <F
                    label="Country"
                    value={form.country}
                    onChange={(v) => setForm((f) => ({ ...f, country: v }))}
                  />
                </div>
              </Group>

              <Group title="Social / external">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="LinkedIn URL"
                    value={form.linkedinUrl}
                    onChange={(v) => setForm((f) => ({ ...f, linkedinUrl: v }))}
                  />
                  <F
                    label="Twitter handle"
                    value={form.twitterHandle}
                    onChange={(v) => setForm((f) => ({ ...f, twitterHandle: v }))}
                  />
                  <F
                    label="Website"
                    value={form.websiteUrl}
                    onChange={(v) => setForm((f) => ({ ...f, websiteUrl: v }))}
                  />
                  <F
                    label="Crunchbase URL"
                    value={form.crunchbaseUrl}
                    onChange={(v) => setForm((f) => ({ ...f, crunchbaseUrl: v }))}
                  />
                  <F
                    label="Tracxn URL"
                    value={form.tracxnUrl}
                    onChange={(v) => setForm((f) => ({ ...f, tracxnUrl: v }))}
                  />
                  <F
                    label="AngelList URL"
                    value={form.angellistUrl}
                    onChange={(v) => setForm((f) => ({ ...f, angellistUrl: v }))}
                  />
                </div>
              </Group>

              <Group title="Investment signals">
                <div className="grid gap-3 sm:grid-cols-2">
                  <F
                    label="Check size min (USD)"
                    type="number"
                    value={form.checkSizeMinUsd}
                    onChange={(v) => setForm((f) => ({ ...f, checkSizeMinUsd: v }))}
                  />
                  <F
                    label="Check size max (USD)"
                    type="number"
                    value={form.checkSizeMaxUsd}
                    onChange={(v) => setForm((f) => ({ ...f, checkSizeMaxUsd: v }))}
                  />
                  <F
                    label="Sector interests (comma-sep)"
                    value={form.sectorInterests}
                    onChange={(v) => setForm((f) => ({ ...f, sectorInterests: v }))}
                  />
                  <F
                    label="Stage interests (comma-sep)"
                    value={form.stageInterests}
                    onChange={(v) => setForm((f) => ({ ...f, stageInterests: v }))}
                  />
                  <F
                    label="Warmth score (0-100)"
                    type="number"
                    value={form.warmthScore}
                    onChange={(v) => setForm((f) => ({ ...f, warmthScore: v }))}
                  />
                  <F
                    label="Intro path"
                    value={form.introPath}
                    onChange={(v) => setForm((f) => ({ ...f, introPath: v }))}
                  />
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Source of lead
                    </span>
                    <select
                      value={form.sourceOfLead}
                      onChange={(e) => setForm((f) => ({ ...f, sourceOfLead: e.target.value }))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    >
                      <option value="">— pick —</option>
                      <option value="tracxn">Tracxn import</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Warm referral</option>
                      <option value="inbound_email">Inbound email</option>
                      <option value="twitter">Twitter / X</option>
                      <option value="event">Event / pitch</option>
                      <option value="self_serve">Self-serve NDA</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <F
                    label="Referrer name (if warm)"
                    value={form.referrerName}
                    onChange={(v) => setForm((f) => ({ ...f, referrerName: v }))}
                  />
                </div>
              </Group>

              <Group title="Notes">
                <TA
                  label="Bio summary"
                  value={form.bioSummary}
                  onChange={(v) => setForm((f) => ({ ...f, bioSummary: v }))}
                />
                <TA
                  label="Personal thesis notes (private)"
                  value={form.personalThesisNotes}
                  onChange={(v) => setForm((f) => ({ ...f, personalThesisNotes: v }))}
                />
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
                  Save investor
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

function TA({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
    </label>
  );
}
