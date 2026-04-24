import Link from 'next/link';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { Concierge } from '@/components/public/concierge';

export default function LandingPage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
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
        <nav className="flex items-center gap-4 text-sm text-slate-700">
          <Link href="/ask" className="hidden transition hover:text-violet-700 sm:inline">
            Ask Priya
          </Link>
          <Link
            href="/nda"
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/70 px-3.5 py-1.5 font-medium text-violet-800 backdrop-blur transition hover:-translate-y-px hover:border-violet-400 hover:bg-white"
          >
            <Lock className="h-3.5 w-3.5" /> Sign NDA
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-col items-stretch px-6 pb-16 pt-16 sm:pt-24">
        <div className="flex flex-col items-center gap-5 pb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-3.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-violet-800 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Investor Wonderland
          </span>
          <h1 className="animate-hero-shimmer bg-gradient-to-b from-slate-900 to-slate-700 bg-clip-text text-4xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-[56px]">
            Investors don&apos;t read pitches.
            <br />
            They have conversations.
          </h1>
          <p className="max-w-xl text-balance text-[17px] leading-relaxed text-slate-600">
            Priya is our AI concierge. She answers from what the founders have written — with
            citations, no hype, no hallucinations. Ask anything.
          </p>
        </div>

        <div className="rounded-[32px] border border-violet-100 bg-white/80 p-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_40px_80px_-40px_rgba(91,33,182,0.30)] backdrop-blur-md sm:p-6">
          <Concierge autofocus />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Grounded in
            the founders&apos; own writing
          </span>
          <Link
            href="/nda"
            className="inline-flex items-center gap-1 font-medium text-violet-700 transition hover:text-violet-900"
          >
            Unlock the data room <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-violet-100/60 px-6 py-8 text-xs text-slate-500">
        <span>© OotaOS 2026</span>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="transition hover:text-violet-700">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-violet-700">
            Terms
          </Link>
          <a href="mailto:info@ootaos.com" className="transition hover:text-violet-700">
            info@ootaos.com
          </a>
        </div>
      </footer>
    </main>
  );
}
