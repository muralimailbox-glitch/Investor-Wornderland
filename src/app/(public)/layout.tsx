import type { ReactNode } from 'react';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-[#FAF5FF]">{children}</div>;
}
