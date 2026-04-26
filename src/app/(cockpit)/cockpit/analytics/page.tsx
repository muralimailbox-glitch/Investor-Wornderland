import { redirect } from 'next/navigation';

import { AnalyticsBoard } from '@/components/cockpit/analytics-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics — Cockpit' };

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');
  return (
    <CockpitShell email={session.user.email}>
      <AnalyticsBoard />
    </CockpitShell>
  );
}
