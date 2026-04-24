'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { BookOpen, LayoutDashboard, LogOut, Mail, Menu, Users, Waypoints, X } from 'lucide-react';

const NAV = [
  { href: '/cockpit', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cockpit/investors', label: 'Investors', icon: Users },
  { href: '/cockpit/pipeline', label: 'Pipeline', icon: Waypoints },
  { href: '/cockpit/inbox', label: 'Inbox', icon: Mail },
  { href: '/cockpit/knowledge', label: 'Knowledge', icon: BookOpen },
];

export function CockpitShell({ email, children }: { email: string | null; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await fetch('/api/v1/admin/auth/logout', { method: 'POST' }).catch(() => null);
    router.push('/cockpit/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white/95 px-4 py-6 backdrop-blur transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="mb-8 flex items-center justify-between gap-2">
          <Link
            href="/cockpit"
            className="flex items-center gap-2 font-semibold tracking-tight text-slate-900"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/30">
              O
            </span>
            <span>OotaOS</span>
          </Link>
          <button
            type="button"
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/cockpit' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-violet-50 text-violet-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span className="truncate">{email ?? 'Signed in'}</span>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-slate-900"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-0">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-600"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-slate-900">OotaOS</span>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
