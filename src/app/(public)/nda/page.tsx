import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { InvestorIdentityPill } from '@/components/public/investor-identity-pill';
import { NdaFlow } from '@/components/public/nda-flow';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';

export const metadata = { title: 'Sign NDA — OotaOS' };

export default async function NdaPage() {
  const jar = await cookies();
  const session = verifyInvestorLink(jar.get(INVESTOR_COOKIE)?.value);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#FFF6EC] via-white to-[#FFEDF5]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-8">
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
        <div className="flex items-center gap-2">
          {session ? (
            <InvestorIdentityPill
              firstName={session.firstName}
              lastName={session.lastName}
              firmName={session.firmName}
            />
          ) : null}
          <Link
            href="/ask"
            className="rounded-full border border-orange-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-orange-700 backdrop-blur transition hover:-translate-y-px hover:border-orange-400 hover:bg-white"
          >
            Ask Priya
          </Link>
        </div>
      </header>
      <section className="mx-auto w-full max-w-2xl px-6 pb-16 pt-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">
          {session?.firstName
            ? `${session.firstName}, unlock the data room`
            : 'Unlock the data room'}
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
