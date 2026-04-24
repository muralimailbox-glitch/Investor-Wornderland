import Link from 'next/link';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { NdaFlow } from '@/components/public/nda-flow';

export const metadata = { title: 'Sign NDA — OotaOS' };

export default function NdaPage() {
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
        <Link href="/ask" className="text-sm text-slate-600 transition hover:text-violet-700">
          Ask Priya
        </Link>
      </header>
      <section className="mx-auto w-full max-w-xl px-6 pb-16 pt-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">
          Unlock the data room
        </h1>
        <p className="mb-6 text-[15px] text-slate-600">
          Sign a short mutual NDA and Priya hands you the deck, the traction numbers, and the
          team&apos;s calendar — in 40 seconds flat.
        </p>
        <NdaFlow />
      </section>
    </main>
  );
}
