import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { AnimatedBackdrop } from '@/components/public/animated-backdrop';
import { WhatsappButton } from '@/components/public/whatsapp-button';
import { INVESTOR_COOKIE, verifyInvestorLink } from '@/lib/auth/investor-link';

/**
 * Marketing splash. Per rule #8, the public root is invite-bound — anonymous
 * visitors get a marketing page, never default-workspace data. Cookie-validated
 * investors are forwarded to the deal-scoped lounge.
 */
export default async function LandingPage() {
  const jar = await cookies();
  const token = jar.get(INVESTOR_COOKIE)?.value;
  const session = verifyInvestorLink(token);
  if (session) {
    redirect('/lounge');
  }

  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE]" />
      <div className="absolute inset-0 -z-10">
        <AnimatedBackdrop />
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-8">
        <Link href="/" aria-label="OotaOS home" className="flex items-center">
          <Image
            src="/brand/oota-light.png"
            alt="OotaOS"
            width={200}
            height={220}
            priority
            className="h-20 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-2 text-sm text-slate-700">
          <WhatsappButton
            message="Hi Krish — I'm an investor interested in OotaOS and would like a personal link."
            variant="pill"
          />
          <a
            href="mailto:info@ootaos.com?subject=Investor%20interest%20in%20OotaOS"
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/70 px-3.5 py-1.5 font-medium text-orange-800 backdrop-blur transition hover:-translate-y-px hover:border-orange-400 hover:bg-white"
          >
            Email us
          </a>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-col items-stretch px-6 pb-16 pt-16 sm:pt-24">
        <div className="flex flex-col items-center gap-5 pb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/70 px-3.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-violet-800 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> OotaOS — Investor Relations
          </span>
          <h1 className="animate-hero-shimmer bg-gradient-to-b from-slate-900 to-slate-700 bg-clip-text text-4xl font-semibold leading-[1.05] tracking-tight text-transparent sm:text-[56px]">
            Investors don&apos;t read pitches.
            <br />
            They have conversations.
          </h1>
          <p className="max-w-xl text-balance text-[17px] leading-relaxed text-slate-600">
            OotaOS is a restaurant operating system — POS, QR ordering, KDS, reservations,
            inventory, marketing, and reporting in one stack. We&apos;re raising USD 800K for 10% at
            USD 8M post.
          </p>
          <p className="max-w-xl text-balance text-sm text-slate-500">
            Investor access is invite-only. If we&apos;ve been in touch, your magic link will land
            you straight in the deal-scoped lounge with the AI concierge and the data room.
          </p>
        </div>

        <div className="rounded-[32px] border border-orange-100 bg-white/80 p-8 text-center shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_40px_80px_-40px_rgba(234,88,12,0.25)] backdrop-blur-md">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Want a private link?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Reach out with the firm you represent and we&apos;ll send a personalized link with your
            name, your firm, and the deal context already wired in.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <WhatsappButton message="Hi Krish — I'd like a personal investor link for OotaOS." />
            <a
              href="mailto:info@ootaos.com?subject=Investor%20access%20request"
              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-medium text-orange-800 transition hover:-translate-y-px hover:bg-orange-50"
            >
              info@ootaos.com
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Grounded in
            the founders&apos; own writing — every answer carries citations
          </span>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-violet-100/60 px-6 py-8 text-xs text-slate-500">
        <span>© OotaOS 2026 · Sydney, Australia</span>
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
