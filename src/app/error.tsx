'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app:error]', error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-[#F5F0FF] via-white to-[#FFF8EE] px-6">
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border border-rose-100 bg-white/90 p-8 text-center shadow-[0_40px_80px_-40px_rgba(244,63,94,0.30)] backdrop-blur">
        <Image
          src="/brand/oota-light.png"
          alt="OotaOS"
          width={140}
          height={154}
          priority
          className="h-16 w-auto"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
            Something broke
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            We hit a snag.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Try again — usually a one-time blip. If it keeps happening, email info@ootaos.com and
            we&apos;ll fix it the same day.
          </p>
          {error.digest ? (
            <p className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-[11px] font-mono text-slate-500">
              ref: {error.digest}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/30"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </div>
    </main>
  );
}
