'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, FileSignature, Loader2, Lock, Mail, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Mode = 'email' | 'nda';
type Step = 'intro' | 'email-entry' | 'code-entry' | 'verified';

type Props = {
  mode: Mode;
  onClose: () => void;
  initialEmail?: string;
  onVerified?: (payload: { emailUpdated: boolean }) => void;
};

export function InvestorGateModal({ mode, onClose, initialEmail, onVerified }: Props) {
  const [step, setStep] = useState<Step>(mode === 'email' ? 'email-entry' : 'intro');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailUpdated, setEmailUpdated] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === 'code-entry') codeRef.current?.focus();
  }, [step]);

  async function sendCode() {
    if (!email || !/.+@.+\..+/.test(email)) {
      setError('Please enter a valid email.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/invite/otp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? 'Could not send code');
      }
      setStep('code-entry');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code we just emailed.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/invite/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; emailVerified?: boolean; emailUpdated?: boolean; title?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.title ?? 'That code did not match. Try again?');
      }
      setEmailUpdated(Boolean(data.emailUpdated));
      setStep('verified');
      onVerified?.({ emailUpdated: Boolean(data.emailUpdated) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-md rounded-3xl border border-violet-100 bg-white/95 p-7 shadow-[0_30px_80px_-20px_rgba(91,33,182,0.35)] backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>

          {mode === 'nda' && step === 'intro' ? (
            <NdaIntro onContinue={() => (window.location.href = '/nda')} onClose={onClose} />
          ) : null}

          {mode === 'email' && step === 'email-entry' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700/80">
                <Lock className="h-3.5 w-3.5" /> Verify email to go deeper
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Happy to share the numbers — let&apos;s verify your email first.
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                We&apos;ll email a 6-digit code. It takes about 30 seconds, and keeps our founders&apos;
                sensitive detail out of the wrong inboxes.
              </p>
              <label className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Work email
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendCode();
                }}
                placeholder="you@firm.com"
                className="w-full rounded-2xl border border-violet-200 bg-white/95 px-4 py-3 text-[15px] text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
              />
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <button
                type="button"
                onClick={sendCode}
                disabled={busy}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Email me a code
              </button>
              <p className="text-[11px] text-slate-500">
                Using an email different from the one we invited? That&apos;s fine — we&apos;ll update
                your record once verified.
              </p>
            </div>
          ) : null}

          {mode === 'email' && step === 'code-entry' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700/80">
                <Mail className="h-3.5 w-3.5" /> Check your inbox
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                We just emailed a 6-digit code
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Sent to <span className="font-medium text-slate-900">{email}</span>. It&apos;s valid
                for 10 minutes.
              </p>
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCode();
                }}
                placeholder="123456"
                className="w-full rounded-2xl border border-violet-200 bg-white/95 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-300"
              />
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <button
                type="button"
                onClick={confirmCode}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verify
              </button>
              <button
                type="button"
                onClick={() => {
                  setCode('');
                  setError(null);
                  setStep('email-entry');
                }}
                className="text-[12px] text-violet-700 underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : null}

          {step === 'verified' ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                You&apos;re verified.
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                {emailUpdated
                  ? "We've updated your email on file. Ask Priya anything — you'll get the deeper colour now."
                  : "Ask Priya anything — you'll get the deeper colour now."}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-px"
              >
                Back to the conversation
              </button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function NdaIntro({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-700/80">
        <FileSignature className="h-3.5 w-3.5" /> Sign the NDA to unlock the data room
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        Two minutes, one signature — and you&apos;re in.
      </h2>
      <p className="text-sm leading-relaxed text-slate-600">
        Mutual, founder-friendly terms. You&apos;ll get a sealed, countersigned PDF immediately
        after signing, and the lounge opens up the moment you&apos;re done.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:-translate-y-px"
        >
          Open the NDA
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
