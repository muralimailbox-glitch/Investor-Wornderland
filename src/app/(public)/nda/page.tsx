import Image from 'next/image';
import Link from 'next/link';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { NdaFlow } from '@/components/public/nda-flow';

export const metadata = { title: 'Sign NDA — OotaOS' };

export default function NdaPage() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#FFF6EC] via-white to-[#FFEDF5]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <Link href="/" aria-label="OotaOS home" className="flex items-center">
          <Image
            src="/brand/oota-light.png"
            alt="OotaOS"
            width={180}
            height={200}
            priority
            className="h-16 w-auto"
          />
        </Link>
        <Link
          href="/ask"
          className="rounded-full border border-orange-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-orange-700 backdrop-blur transition hover:-translate-y-px hover:border-orange-400 hover:bg-white"
        >
          Ask Priya
        </Link>
      </header>
      <section className="mx-auto w-full max-w-2xl px-6 pb-16 pt-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">
          Unlock the data room
        </h1>
        <p className="mb-6 text-[15px] text-slate-600">
          Read and sign the mutual NDA below. Once you sign, the data room and the founder&apos;s
          calendar open immediately.
        </p>
        <NdaFlow />
      </section>
    </main>
  );
}
