import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { Concierge } from '@/components/public/concierge';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';

export const metadata = { title: 'Ask Priya — OotaOS' };

/**
 * Cookie-gated AI concierge. Anonymous visitors are bounced to the marketing
 * splash (rule #8). Cookie-validated investors get the deal-scoped Priya chat.
 */
export default async function AskPage() {
  const jar = await cookies();
  const session = verifyInvestorLink(jar.get(INVESTOR_COOKIE)?.value);
  if (!session) redirect('/?link=expired');

  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-8">
        <Link href="/lounge" aria-label="OotaOS home" className="flex items-center">
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
          href="/nda"
          className="rounded-full border border-violet-200 bg-white/70 px-3.5 py-1.5 text-sm font-medium text-violet-800 backdrop-blur transition hover:bg-white"
        >
          Sign NDA
        </Link>
      </header>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">
          Hi {session.firstName} — ask Priya anything.
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Grounded in the OotaOS knowledge base. Sign the NDA to unlock the data room and founder
          calendar.
        </p>
        <div className="rounded-3xl border border-violet-100 bg-white/85 p-4 shadow-[0_40px_80px_-40px_rgba(91,33,182,0.30)] backdrop-blur sm:p-6">
          <Concierge autofocus />
        </div>
      </section>
    </main>
  );
}
