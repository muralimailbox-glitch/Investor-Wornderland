'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Lock } from 'lucide-react';

export default function CockpitLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [hp, setHp] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function fetchChallenge() {
      try {
        const res = await fetch('/api/v1/admin/auth/login-challenge', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { challenge?: string };
        if (alive && data.challenge) setChallenge(data.challenge);
      } catch {
        /* ignore — form will error clearly on submit */
      }
    }
    void fetchChallenge();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!challenge) throw new Error('loading');
      const res = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, challenge, hp }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        throw new Error(data?.title ?? 'invalid_credentials');
      }
      router.push('/cockpit');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'invalid_credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_40px_120px_-30px_rgba(139,92,246,0.4)] backdrop-blur-xl"
      >
        <div className="absolute -top-20 -right-20 h-52 w-52 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
              <Lock className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-300">
                Founder Cockpit
              </p>
              <h1 className="text-xl font-semibold text-white">Welcome back</h1>
            </div>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
              required
            />
            {/* honeypot — hidden from humans and password managers */}
            <div aria-hidden="true" style={{ display: 'none' }}>
              <input
                type="text"
                name="url"
                tabIndex={-1}
                autoComplete="new-password"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-rose-300">
                {error === 'invalid_credentials'
                  ? 'Email or password is off.'
                  : error === 'loading'
                    ? 'One moment — preparing secure session.'
                    : error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !email || !password || !challenge}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 font-medium text-white shadow-lg shadow-violet-500/40 transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enter cockpit
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </motion.div>
    </main>
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
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-violet-200/80">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] text-white placeholder-white/40 outline-none transition focus:border-violet-400 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/40"
        {...rest}
      />
    </label>
  );
}
