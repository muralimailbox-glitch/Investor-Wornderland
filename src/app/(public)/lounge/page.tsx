import Link from 'next/link';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { Lounge } from '@/components/public/lounge';

export const metadata = { title: 'Data Room — OotaOS' };

export default function LoungePage() {
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
      </header>
      <section className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-900">Data room</h1>
        <Lounge />
      </section>
    </main>
  );
}
