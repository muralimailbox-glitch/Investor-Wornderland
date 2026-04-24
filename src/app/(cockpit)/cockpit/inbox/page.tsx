import { redirect } from 'next/navigation';

import { InboxBoard } from '@/components/cockpit/inbox-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox — Cockpit' };

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <InboxBoard />
    </CockpitShell>
  );
}
