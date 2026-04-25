import Image from 'next/image';
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
        <Link href="/" aria-label="OotaOS home" className="flex items-center">
          <Image
            src="/brand/oota-rect-tagline.png"
            alt="OotaOS"
            width={220}
            height={56}
            priority
            className="h-10 w-auto"
          />
        </Link>
      </header>
      <section className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight text-slate-900">Data room</h1>
        <Lounge />
      </section>
    </main>
  );
}
