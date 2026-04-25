'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Step = 'intro' | 'otp' | 'sign' | 'done';

export function NdaFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [firm, setFirm] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [signingToken, setSigningToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/nda/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, firm, email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? 'Could not send code');
      }
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/nda/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? 'Invalid code');
      }
      const data = (await res.json()) as { token: string };
      setSigningToken(data.token);
      setStep('sign');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    if (!signingToken) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/nda/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: signingToken,
          name: fullName,
          title: title || 'Investor',
          firm,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? 'Could not sign');
      }
      setStep('done');
      setTimeout(() => router.push('/lounge'), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-violet-100 bg-white/85 p-6 shadow-[0_40px_80px_-40px_rgba(91,33,182,0.30)] backdrop-blur sm:p-8">
      <div className="mb-6 flex items-center gap-2">
        {(['intro', 'otp', 'sign', 'done'] as Step[]).map((s, i) => {
          const active = (['intro', 'otp', 'sign', 'done'] as Step[]).indexOf(step) >= i;
          return (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition ${active ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-slate-200'}`}
            />
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === 'intro' ? (
          <motion.form
            key="intro"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void sendOtp();
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Introduce yourself</h2>
            <p className="text-sm text-slate-600">
              This takes 40 seconds. We send a 6-digit code to confirm your email, you click sign, the data
              room opens.
            </p>
            <Field label="Full name" value={fullName} onChange={setFullName} required autoComplete="name" />
            <Field
              label="Title"
              value={title}
              onChange={setTitle}
              autoComplete="organization-title"
              placeholder="Partner, Principal, Angel…"
            />
            <Field label="Firm" value={firm} onChange={setFirm} required autoComplete="organization" />
            <Field
              label="Work email"
              value={email}
              onChange={setEmail}
              required
              type="email"
              autoComplete="email"
            />
            <ErrorLine error={error} />
            <SubmitButton busy={busy} disabled={!fullName || !firm || !email}>Send verification code</SubmitButton>
          </motion.form>
        ) : null}

        {step === 'otp' ? (
          <motion.form
            key="otp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void verifyOtp();
            }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Check your inbox</h2>
            <p className="text-sm text-slate-600">
              We sent a 6-digit code to <span className="font-medium text-slate-900">{email}</span>. It expires
              in 10 minutes.
            </p>
            <Field
              label="6-digit code"
              value={otp}
              onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
            />
            <ErrorLine error={error} />
            <SubmitButton busy={busy} disabled={otp.length < 6}>Verify code</SubmitButton>
            <button
              type="button"
              onClick={() => setStep('intro')}
              className="text-sm text-slate-500 transition hover:text-slate-800"
            >
              Use a different email
            </button>
          </motion.form>
        ) : null}

        {step === 'sign' ? (
          <motion.div
            key="sign"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col gap-4"
          >
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Review and sign</h2>
            <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 text-sm leading-relaxed text-slate-700">
              <p className="font-medium text-slate-900">Mutual Non-Disclosure Agreement (short form)</p>
              <p className="mt-2">
                {fullName} of {firm} and OotaOS Technologies agree to hold in confidence all non-public
                information shared as part of this fundraise, and not to disclose it to any third party
                without written consent, for a period of two years from the date of signature.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Full legal text is included in the PDF we seal to your email after you click below.
              </p>
            </div>
            <ErrorLine error={error} />
            <button
              type="button"
              onClick={() => void sign()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign NDA and open the data room
              <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        ) : null}

        {step === 'done' ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 py-8 text-center"
          >
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Signed. Taking you in.</h2>
            <p className="text-sm text-slate-600">A sealed PDF copy is on its way to {email}.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.15em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
        {...rest}
      />
    </label>
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 font-medium text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="text-sm text-rose-600">{error}</p>;
}
