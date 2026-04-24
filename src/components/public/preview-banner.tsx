'use client';

import { Eye, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type PreviewStatus =
  | { active: false }
  | { active: true; investorId: string | null; investorName: string | null; expiresAt: string };

export function PreviewBanner() {
  const [status, setStatus] = useState<PreviewStatus>({ active: false });
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/preview/status', { cache: 'no-store' });
        if (!res.ok) return;
        setStatus((await res.json()) as PreviewStatus);
      } catch {
        // silent
      }
    })();
  }, []);

  if (!status.active) return null;

  const label = status.investorName ? `Previewing as ${status.investorName}` : 'Previewing as a cold investor';

  const onExit = async () => {
    setExiting(true);
    try {
      await fetch('/api/v1/preview/exit', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/cockpit';
    }
  };

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm text-white shadow-lg shadow-violet-500/30">
      <div className="flex items-center gap-2 font-medium">
        <Eye className="h-4 w-4" />
        <span>{label}</span>
        <span className="hidden text-xs text-white/70 sm:inline">
          · expires {new Date(status.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <button
        onClick={() => void onExit()}
        disabled={exiting}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold transition hover:bg-white/25 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" /> Exit preview
      </button>
    </div>
  );
}
