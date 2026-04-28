import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { Concierge } from '@/components/public/concierge';
import { InvestorIdentityPill } from '@/components/public/investor-identity-pill';
import { WhatsappButton } from '@/components/public/whatsapp-button';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';

export const metadata = { title: 'Ask Olivia — OotaOS' };

/**
 * Cookie-gated AI concierge. Anonymous visitors are bounced to the marketing
 * splash (rule #8). Cookie-validated investors get the deal-scoped Olivia chat.
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
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 pt-8">
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
        <div className="flex items-center gap-2">
          <InvestorIdentityPill
            firstName={session.firstName}
            lastName={session.lastName}
            firmName={session.firmName}
          />
          <WhatsappButton
            message={`Hi Murali — investor question from ${session.firstName} ${session.lastName}${
              session.firmName ? ` (${session.firmName})` : ''
            }.`}
            variant="pill"
          />
          <Link
            href="/nda"
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-md shadow-violet-500/30 transition hover:-translate-y-px"
          >
            Sign NDA → unlock data room
          </Link>
        </div>
      </header>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-slate-900">
          Hi {session.firstName} — ask Olivia anything.
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
