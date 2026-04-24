import type { ReactNode } from 'react';

import { PreviewBanner } from '@/components/public/preview-banner';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#FAF5FF]">
      <PreviewBanner />
      {children}
    </div>
  );
}
