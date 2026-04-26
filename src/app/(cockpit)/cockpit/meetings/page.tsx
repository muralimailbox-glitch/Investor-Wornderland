import { redirect } from 'next/navigation';

import { MeetingsBoard } from '@/components/cockpit/meetings-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Meetings — Cockpit' };

export default async function MeetingsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <MeetingsBoard />
    </CockpitShell>
  );
}
