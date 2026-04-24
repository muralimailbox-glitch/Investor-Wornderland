import Link from 'next/link';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { Concierge } from '@/components/public/concierge';

export const metadata = { title: 'Ask Priya — OotaOS' };

export default function AskPage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-slate-900"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/30"
          >
            O
          </span>
          OotaOS
        </Link>
        <Link
          href="/nda"
          className="rounded-full border border-violet-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-violet-800 backdrop-blur transition hover:bg-white"
        >
          Sign NDA
        </Link>
      </header>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-900">Ask Priya</h1>
        <div className="rounded-3xl border border-violet-100 bg-white/85 p-4 shadow-[0_40px_80px_-40px_rgba(91,33,182,0.30)] backdrop-blur sm:p-6">
          <Concierge autofocus />
        </div>
      </section>
    </main>
  );
}
