import { redirect } from 'next/navigation';

import { DocumentsBoard } from '@/components/cockpit/documents-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload decks, memos, and data-room files. Investors see them in the lounge after NDA.
          </p>
        </header>
        <DocumentsBoard />
      </div>
    </CockpitShell>
  );
}
