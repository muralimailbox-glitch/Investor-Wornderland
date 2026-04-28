'use client';

/**
 * Full-page investor detail view. Three sections:
 *
 *   1. Header — identity, firm, stage badge, warmth, key actions
 *      (Send invite link, Edit, Bulk-email-with-this-cohort, Back)
 *   2. Communications — AI composer (always-open) above the timeline.
 *      Founder reads recent activity and drafts the next email in the
 *      same scroll.
 *   3. Profile — investor + firm fields, sectors, stage focus, fit
 *      rationale, intro path. Click "Edit" to open the existing
 *      InvestorEditModal in-place.
 *
 * Designed for keyboard-first deep work: the activity drawer is the
 * 28-rem peek surface; this is the full-screen "do work" surface.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Sparkles,
} from 'lucide-react';

import { AiEmailComposer } from '@/components/cockpit/ai-email-composer';
import { InvestorEditModal } from '@/components/cockpit/investor-edit-modal';
import { InvestorIntelligence } from '@/components/cockpit/investor-intelligence';
import { InviteLinkModal } from '@/components/cockpit/invite-link-modal';
import { getInvestorActivity, type InvestorActivity } from '@/lib/api/investor-activity';

type InvestorRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  decisionAuthority: string;
  timezone: string;
  warmthScore: number | null;
  city: string | null;
  country: string | null;
  bioSummary: string | null;
  fitRationale: string | null;
  introPath: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  tracxnUrl: string | null;
  sectorInterests: string[] | null;
  stageInterests: string[] | null;
  pastInvestments: unknown;
  checkSizeMinUsd: number | null;
  checkSizeMaxUsd: number | null;
  lastContactAt: string | null;
  emailVerifiedAt: string | null;
};

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-700',
  contacted: 'bg-sky-100 text-sky-700',
  engaged: 'bg-indigo-100 text-indigo-700',
  nda_pending: 'bg-amber-100 text-amber-700',
  nda_signed: 'bg-violet-100 text-violet-700',
  meeting_scheduled: 'bg-fuchsia-100 text-fuchsia-700',
  diligence: 'bg-blue-100 text-blue-700',
  term_sheet: 'bg-emerald-100 text-emerald-700',
  funded: 'bg-emerald-200 text-emerald-800',
  closed_lost: 'bg-rose-100 text-rose-700',
};

export function InvestorDetail({ investorId }: { investorId: string }) {
  const [investor, setInvestor] = useState<InvestorRecord | null>(null);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [activity, setActivity] = useState<InvestorActivity | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // setLoading(true) is initialised via useState; the effect only fires
    // once per (investorId, refreshTick) pair so re-fetches don't need to
    // toggle loading back on. The lint rule forbids set-state directly
    // inside the effect body.
    Promise.all([
      fetch(`/api/v1/admin/investors/${investorId}`, { credentials: 'include' }).then(async (r) => {
        if (!r.ok) throw new Error(`investor: ${r.status}`);
        return (await r.json()) as InvestorRecord & { firmId?: string };
      }),
      getInvestorActivity(investorId),
      fetch(`/api/v1/admin/investors?pageSize=1&search=${encodeURIComponent(investorId)}`, {
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(async ([inv, act]) => {
        if (!alive) return;
        setInvestor(inv);
        setActivity(act);
        // Resolve firm name + active lead stage from the list endpoint.
        // Cheaper than a dedicated /investors/[id]/full route.
        if (inv && (inv as { firmId?: string }).firmId) {
          const firmRes = await fetch(
            `/api/v1/admin/firms/${(inv as { firmId?: string }).firmId}`,
            { credentials: 'include' },
          ).catch(() => null);
          if (firmRes && firmRes.ok) {
            const firm = (await firmRes.json()) as { name?: string };
            if (alive) setFirmName(firm.name ?? null);
          }
        }
        // The activity API doesn't return current stage; pull from list.
        const leadsRes = await fetch(`/api/v1/admin/investors?pageSize=200`, {
          credentials: 'include',
        }).catch(() => null);
        if (leadsRes && leadsRes.ok) {
          type Row = { investor: { id: string } | null; lead: { stage: string } | null };
          const list = (await leadsRes.json()) as { rows: Row[] };
          const row = list.rows.find((r) => r.investor?.id === investorId);
          if (alive) setStage(row?.lead?.stage ?? null);
        }
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [investorId, refreshTick]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-6 py-12 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading investor…
      </div>
    );
  }

  if (error || !investor) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <Link
          href="/cockpit/investors"
          className="inline-flex items-center gap-1 text-sm text-violet-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to investors
        </Link>
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? 'Investor not found.'}
        </div>
      </div>
    );
  }

  const fullName = `${investor.firstName} ${investor.lastName}`.trim();
  const portfolio = Array.isArray(investor.pastInvestments)
    ? (investor.pastInvestments as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
      <Link
        href="/cockpit/investors"
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-violet-700 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to investors
      </Link>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Investor
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{fullName}</h1>
          <p className="text-sm text-slate-600">
            {investor.title}
            {firmName ? ` · ${firmName}` : ''}
            {investor.city || investor.country
              ? ` · ${[investor.city, investor.country].filter(Boolean).join(', ')}`
              : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <a
              href={`mailto:${investor.email}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 hover:bg-slate-100"
            >
              <Mail className="h-3 w-3" /> {investor.email}
            </a>
            {investor.linkedinUrl ? (
              <a
                href={investor.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700 hover:bg-sky-100"
              >
                <Link2 className="h-3 w-3" /> LinkedIn
              </a>
            ) : null}
            {investor.websiteUrl ? (
              <a
                href={investor.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
              >
                <Globe className="h-3 w-3" /> Website
              </a>
            ) : null}
            {investor.tracxnUrl ? (
              <a
                href={investor.tracxnUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-700 hover:bg-violet-100"
              >
                <ExternalLink className="h-3 w-3" /> Tracxn
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {stage ? (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  STAGE_COLORS[stage] ?? 'bg-slate-100 text-slate-700'
                }`}
              >
                {stage.replace(/_/g, ' ')}
              </span>
            ) : null}
            {investor.warmthScore != null ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800">
                <Sparkles className="h-3 w-3" /> warmth {investor.warmthScore}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-px"
            >
              <Mail className="h-3.5 w-3.5" /> Send invite link
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit profile
            </button>
          </div>
        </div>
      </header>

      {/* Compose */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Compose
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
            Draft & send to {investor.firstName}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The AI uses {activity?.summary?.questionsAsked ?? 0} prior questions, this
            investor&apos;s warmth + sector focus, their portfolio companies, and your last voice
            samples.
          </p>
        </div>
        <div className="mt-4">
          <AiEmailComposer
            investorId={investor.id}
            investorEmail={investor.email}
            investorFirstName={investor.firstName}
            alwaysOpen
            onSent={() => setRefreshTick((t) => t + 1)}
          />
        </div>
      </section>

      {/* Activity intelligence — rich audit of what the investor asked,
          what AI returned, what docs they viewed, every touch point. */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
              Activity intelligence
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              What {investor.firstName} did, what Priya returned
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Audit the conversation: every question, every AI answer, every document fetch. Use it
              to tune the prompt, the doc set, and the gating rules.
            </p>
          </div>
          {activity?.summary?.lastQuestionAt ? (
            <span className="text-[11px] text-slate-400">
              last Q {new Date(activity.summary.lastQuestionAt).toLocaleDateString()}
            </span>
          ) : null}
        </div>
        <InvestorIntelligence activity={activity} />
      </section>

      {/* Profile */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Investment signals
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-[11px] text-slate-500">Warmth</dt>
              <dd className="font-medium text-slate-900">{investor.warmthScore ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Decision authority</dt>
              <dd className="font-medium text-slate-900">
                {investor.decisionAuthority.replace(/_/g, ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Check size</dt>
              <dd className="font-medium text-slate-900">
                {investor.checkSizeMinUsd && investor.checkSizeMaxUsd
                  ? `${formatUsd(investor.checkSizeMinUsd)} – ${formatUsd(investor.checkSizeMaxUsd)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">Last contact</dt>
              <dd className="font-medium text-slate-900">
                {investor.lastContactAt
                  ? new Date(investor.lastContactAt).toLocaleDateString()
                  : '—'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] text-slate-500">Sector focus</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(investor.sectorInterests ?? []).map((s) => (
                  <span
                    key={s}
                    className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                  >
                    {s}
                  </span>
                ))}
                {(investor.sectorInterests ?? []).length === 0 ? (
                  <span className="text-slate-400 italic text-xs">—</span>
                ) : null}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] text-slate-500">Stage focus</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(investor.stageInterests ?? []).map((s) => (
                  <span
                    key={s}
                    className="inline-flex rounded-full bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700"
                  >
                    {s.replace(/_/g, ' ')}
                  </span>
                ))}
                {(investor.stageInterests ?? []).length === 0 ? (
                  <span className="text-slate-400 italic text-xs">—</span>
                ) : null}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] text-slate-500">Intro path</dt>
              <dd className="mt-1 text-sm text-slate-700">
                {investor.introPath ?? <span className="text-slate-400 italic">—</span>}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
            Notes & rationale
          </p>
          {investor.fitRationale ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-rose-700">
                Why this fits OotaOS
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{investor.fitRationale}</p>
            </div>
          ) : null}
          {investor.bioSummary ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Bio
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{investor.bioSummary}</p>
            </div>
          ) : null}
          {portfolio.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Notable recent portfolio
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {portfolio.slice(0, 12).map((p, i) => {
                  const company =
                    typeof p === 'object' && p !== null
                      ? String((p as { company?: string }).company ?? '')
                      : '';
                  if (!company) return null;
                  return (
                    <li
                      key={`${company}-${i}`}
                      className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                    >
                      {company}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {!investor.fitRationale && !investor.bioSummary && portfolio.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400 italic">No bio or rationale on file yet.</p>
          ) : null}
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <Building2 className="h-3 w-3 flex-none" />
            <span>
              Edit profile fields, sector/stage focus, fit rationale, and intro path with the Edit
              button above.
            </span>
          </div>
        </div>
      </section>

      {editOpen ? (
        <InvestorEditModal
          investorId={investor.id}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            setRefreshTick((t) => t + 1);
          }}
        />
      ) : null}
      {inviteOpen ? (
        <InviteLinkModal
          investorId={investor.id}
          investorName={fullName}
          investorEmail={investor.email}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </div>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}
