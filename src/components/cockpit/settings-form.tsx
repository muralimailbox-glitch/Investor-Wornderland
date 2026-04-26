'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Key, Loader2, Save, ShieldCheck, UserCog } from 'lucide-react';

import { changePassword, getProfile, updateProfile, type FounderProfile } from '@/lib/api/profile';

type Form = {
  displayName: string;
  whatsappE164: string;
  publicEmail: string;
  signatureMarkdown: string;
  companyName: string;
  companyWebsite: string;
  companyAddress: string;
  logoUrl: string;
  avatarUrl: string;
  defaultTimezone: string;
};

const EMPTY_FORM: Form = {
  displayName: '',
  whatsappE164: '',
  publicEmail: '',
  signatureMarkdown: '',
  companyName: '',
  companyWebsite: '',
  companyAddress: '',
  logoUrl: '',
  avatarUrl: '',
  defaultTimezone: '',
};

function fromProfile(p: FounderProfile): Form {
  return {
    displayName: p.displayName ?? '',
    whatsappE164: p.whatsappE164 ?? '',
    publicEmail: p.publicEmail ?? '',
    signatureMarkdown: p.signatureMarkdown ?? '',
    companyName: p.companyName ?? '',
    companyWebsite: p.companyWebsite ?? '',
    companyAddress: p.companyAddress ?? '',
    logoUrl: p.logoUrl ?? '',
    avatarUrl: p.avatarUrl ?? '',
    defaultTimezone: p.defaultTimezone ?? '',
  };
}

function toPatch(f: Form): Partial<Omit<FounderProfile, 'id' | 'email' | 'role'>> {
  return {
    displayName: f.displayName.trim() || null,
    whatsappE164: f.whatsappE164.trim() || null,
    publicEmail: f.publicEmail.trim() || null,
    signatureMarkdown: f.signatureMarkdown.trim() || null,
    companyName: f.companyName.trim() || null,
    companyWebsite: f.companyWebsite.trim() || null,
    companyAddress: f.companyAddress.trim() || null,
    logoUrl: f.logoUrl.trim() || null,
    avatarUrl: f.avatarUrl.trim() || null,
    defaultTimezone: f.defaultTimezone.trim() || null,
  };
}

export function SettingsForm() {
  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setForm(fromProfile(p));
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(toPatch(form));
      setProfile(updated);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading settings
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">Settings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Your profile</h1>
        <p className="mt-1 text-[15px] text-slate-600">
          How investors see you, how Priya signs emails, and how we reach you.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSave} className="flex flex-col gap-6">
        <Section title="Identity" icon={<UserCog className="h-4 w-4" />}>
          <TextField
            label="Display name"
            value={form.displayName}
            onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
            placeholder="Priya Menon"
          />
          <TextField
            label="Public email"
            value={form.publicEmail}
            onChange={(v) => setForm((f) => ({ ...f, publicEmail: v }))}
            placeholder={profile?.email ?? 'you@company.com'}
            hint="Shown on outreach emails; defaults to your login email."
          />
          <TextField
            label="Avatar URL"
            value={form.avatarUrl}
            onChange={(v) => setForm((f) => ({ ...f, avatarUrl: v }))}
            placeholder="https://…/avatar.jpg"
          />
        </Section>

        <Section title="Contact" icon={<Globe className="h-4 w-4" />}>
          <TextField
            label="WhatsApp (E.164)"
            value={form.whatsappE164}
            onChange={(v) => setForm((f) => ({ ...f, whatsappE164: v }))}
            placeholder="+61412766366"
            hint="Appears as a click-to-chat link in every email signature."
          />
          <TextField
            label="Default timezone"
            value={form.defaultTimezone}
            onChange={(v) => setForm((f) => ({ ...f, defaultTimezone: v }))}
            placeholder="Australia/Perth"
            hint="IANA zone, used to display meeting times in your view."
          />
          <TextArea
            label="Signature (markdown)"
            rows={4}
            value={form.signatureMarkdown}
            onChange={(v) => setForm((f) => ({ ...f, signatureMarkdown: v }))}
            placeholder="Priya Menon&#10;Founder, OotaOS"
            hint="Rendered at the bottom of every outgoing email."
          />
        </Section>

        <Section title="Company" icon={<ShieldCheck className="h-4 w-4" />}>
          <TextField
            label="Company name"
            value={form.companyName}
            onChange={(v) => setForm((f) => ({ ...f, companyName: v }))}
            placeholder="OotaOS"
          />
          <TextField
            label="Company website"
            value={form.companyWebsite}
            onChange={(v) => setForm((f) => ({ ...f, companyWebsite: v }))}
            placeholder="https://ootaos.com"
          />
          <TextArea
            label="Physical address (CAN-SPAM footer)"
            rows={2}
            value={form.companyAddress}
            onChange={(v) => setForm((f) => ({ ...f, companyAddress: v }))}
            placeholder="Level 1, 123 Some Street, Perth WA 6000, Australia"
          />
          <TextField
            label="Logo URL"
            value={form.logoUrl}
            onChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))}
            placeholder="https://…/logo.svg"
          />
        </Section>

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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <GoogleCalendarSection />

      <SecuritySection />
    </div>
  );
}

function GoogleCalendarSection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      // Heuristic — the connected param is set by the OAuth callback redirect.
      const params = new URLSearchParams(window.location.search);
      if (params.get('google') === 'connected') {
        setConnected(true);
        return;
      }
      // Otherwise we don't have a status endpoint; surface as "unknown" so
      // the user can connect or test by attempting a booking.
      setConnected(null);
    });
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch('/api/v1/admin/google-calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      setConnected(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Google Calendar" icon={<Globe className="h-4 w-4" />}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-900">
          {connected === true
            ? 'Connected — investor bookings now create real Calendar events with Google Meet.'
            : connected === false
              ? 'Disconnected. Bookings fall back to a synthetic Meet link.'
              : 'Optional. When connected, every investor booking creates a real Google Calendar event on your account with Google Meet auto-attached and the investor as attendee.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/api/v1/admin/google-calendar/start"
            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            {connected ? 'Reconnect' : 'Connect Google Calendar'}
          </a>
          {connected ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
            >
              Disconnect
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Requires <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and{' '}
          <code>GOOGLE_REDIRECT_URI</code> on Railway. The redirect URI must point to{' '}
          <code>/api/v1/admin/google-calendar/callback</code>.
        </p>
      </div>
    </Section>
  );
}

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMsg('Password updated.');
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Security" icon={<Key className="h-4 w-4" />}>
      {msg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      <form
        onSubmit={onChangePassword}
        className="flex flex-col gap-3 border-t border-slate-100 pt-4"
      >
        <p className="text-sm font-semibold text-slate-900">Change password</p>
        <TextField
          type="password"
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <TextField
          type="password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          hint="12+ chars, upper + lower + number."
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !currentPassword || !newPassword}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Update password
          </button>
        </div>
      </form>
    </Section>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-violet-700">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'password';
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
      />
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
