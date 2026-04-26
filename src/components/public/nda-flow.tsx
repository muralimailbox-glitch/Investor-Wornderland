'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MUTUAL_NDA_MARKDOWN } from '@/lib/nda/mutual-nda-text';

type Step = 'intro' | 'otp' | 'sign' | 'done';

/**
 * Render the NDA markdown into HTML inline. We use a tiny renderer rather
 * than pulling a markdown lib — the source is trusted (we ship it) and the
 * subset (h1, h2, h3, em, strong, hr, p) is small.
 */
function renderNdaMarkdown(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const lines = md.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  for (const raw of lines) {
    const line = raw;
    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      flushPara();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('---')) {
      flushPara();
      out.push('<hr/>');
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return out.join('\n');
}

const NDA_HTML = renderNdaMarkdown(MUTUAL_NDA_MARKDOWN);

export function NdaFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [firm, setFirm] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [signingToken, setSigningToken] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
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
    <div className="relative w-full overflow-hidden rounded-3xl border border-orange-100 bg-white/85 p-6 shadow-[0_40px_80px_-40px_rgba(234,88,12,0.25)] backdrop-blur sm:p-8">
      <div className="mb-6 flex items-center gap-2">
        {(['intro', 'otp', 'sign', 'done'] as Step[]).map((s, i) => {
          const active = (['intro', 'otp', 'sign', 'done'] as Step[]).indexOf(step) >= i;
          return (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition ${
                active
                  ? 'bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600'
                  : 'bg-slate-200'
              }`}
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
            <p className="text-sm text-slate-600">
              Read the full NDA below. Tick the box, then click sign — the data room opens
              immediately.
            </p>
            <div
              className="prose prose-slate prose-sm max-h-[440px] max-w-none overflow-y-auto rounded-2xl border border-orange-100 bg-orange-50/30 p-5 text-[13px] leading-relaxed prose-headings:text-slate-900 prose-headings:tracking-tight prose-h2:text-base prose-h2:font-semibold prose-h3:text-[13px] prose-h3:font-semibold prose-h3:uppercase prose-h3:tracking-[0.12em] prose-h3:text-orange-700 prose-p:text-slate-700"
              dangerouslySetInnerHTML={{ __html: NDA_HTML }}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <p>
                <span className="font-medium text-slate-900">Signed as:</span> {fullName}
                {title ? `, ${title}` : ''} of <span className="font-medium">{firm}</span>
              </p>
              <p className="mt-1">
                <span className="font-medium text-slate-900">Verified email:</span> {email}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Date of signature: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-orange-600 focus:ring-orange-400"
              />
              <span>
                I have read and agree to be bound by the terms of this Mutual Non-Disclosure
                Agreement, and confirm that the name, title, and firm above are accurate.
              </span>
            </label>
            <ErrorLine error={error} />
            <button
              type="button"
              onClick={() => void sign()}
              disabled={busy || !agreed}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-5 py-3 font-medium text-white shadow-lg shadow-rose-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign and enter the data room
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
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Signed. Taking you in.
            </h2>
            <p className="text-sm text-slate-600">
              The data room and the founder&apos;s calendar are open. The signed NDA is logged
              against your name, firm, IP and timestamp on our side for audit.
            </p>
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
        className="rounded-2xl border border-orange-200 bg-white px-4 py-3 text-[15px] text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-300"
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
      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-600 px-5 py-3 font-medium text-white shadow-lg shadow-rose-500/30 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
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
