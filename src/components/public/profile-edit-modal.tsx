'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';

type Profile = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  firmName: string | null;
};

type Props = {
  onClose: () => void;
  onSaved: (profile: Profile) => void;
};

export function ProfileEditModal({ onClose, onSaved }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      fetch('/api/v1/lounge/profile', { credentials: 'include' })
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return (await r.json()) as Profile;
        })
        .then((p) => {
          if (alive) {
            setProfile({
              firstName: p.firstName ?? '',
              lastName: p.lastName === '—' ? '' : (p.lastName ?? ''),
              title: p.title === 'Unknown' ? '' : (p.title ?? ''),
              email: p.email,
              firmName:
                p.firmName === 'Unknown (self-serve NDA)' ? '' : (p.firmName ?? ''),
            });
          }
        })
        .catch((e: Error) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (!profile) return;
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    if (!profile.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!profile.firmName?.trim()) {
      setError('Firm is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/lounge/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          title: profile.title.trim(),
          firmName: (profile.firmName ?? '').trim(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(j?.title ?? `HTTP ${res.status}`);
      }
      onSaved(profile);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-orange-50 via-rose-50 to-fuchsia-50 px-5 py-3">
          <p className="text-sm font-semibold text-slate-900">Update your profile</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 transition hover:bg-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : null}
          {profile ? (
            <>
              <p className="text-[11px] text-slate-500">
                <Sparkles className="mr-1 inline h-3 w-3 text-orange-500" />
                The founders use this to address you correctly. Email stays as{' '}
                <span className="font-medium text-slate-700">{profile.email}</span>.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="First name"
                  value={profile.firstName}
                  onChange={(v) => setProfile({ ...profile, firstName: v })}
                />
                <Field
                  label="Last name"
                  value={profile.lastName}
                  onChange={(v) => setProfile({ ...profile, lastName: v })}
                />
              </div>
              <Field
                label="Title"
                value={profile.title}
                placeholder="e.g. Partner, Principal, Angel"
                onChange={(v) => setProfile({ ...profile, title: v })}
              />
              <Field
                label="Firm"
                value={profile.firmName ?? ''}
                placeholder="e.g. Lightspeed, Sequoia India, Self"
                onChange={(v) => setProfile({ ...profile, firmName: v })}
              />
            </>
          ) : busy ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !profile}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-[11px]">
      <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
      />
    </label>
  );
}
