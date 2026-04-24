import { redirect } from 'next/navigation';

import { InvestorsBoard } from '@/components/cockpit/investors-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Investors — Cockpit' };

export default async function InvestorsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <InvestorsBoard />
    </CockpitShell>
  );
}
