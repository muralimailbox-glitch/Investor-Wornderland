import type { ReactNode } from 'react';

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-white">{children}</div>;
}
