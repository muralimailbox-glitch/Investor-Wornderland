import { redirect } from 'next/navigation';

import { DraftsBoard } from '@/components/cockpit/drafts-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Drafts — Cockpit' };

export default async function DraftsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <DraftsBoard />
    </CockpitShell>
  );
}
