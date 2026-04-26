import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata = { title: 'Not found — OotaOS' };

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE] px-6">
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border border-violet-100 bg-white/85 p-8 text-center shadow-[0_40px_80px_-40px_rgba(91,33,182,0.30)] backdrop-blur">
        <Image
          src="/brand/oota-light.png"
          alt="OotaOS"
          width={140}
          height={154}
          priority
          className="h-16 w-auto"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            404 · Not found
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            That link took a wrong turn.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The page you&apos;re looking for doesn&apos;t exist, has been moved, or your invite link
            expired. Head back to the home page or email us.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/30"
          >
            Home <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:info@ootaos.com"
            className="inline-flex items-center rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50"
          >
            info@ootaos.com
          </a>
        </div>
      </div>
    </main>
  );
}
