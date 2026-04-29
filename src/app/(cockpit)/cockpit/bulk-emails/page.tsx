import { redirect } from 'next/navigation';

import { BulkEmailsBoard } from '@/components/cockpit/bulk-emails-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bulk Emails — Cockpit' };

export default async function BulkEmailsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <BulkEmailsBoard />
    </CockpitShell>
  );
}
