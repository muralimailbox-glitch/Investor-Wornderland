import { redirect } from 'next/navigation';

import { InvestorDetail } from '@/components/cockpit/investor-detail';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Investor — Cockpit' };

export default async function InvestorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');
  const { id } = await params;
  return (
    <CockpitShell email={session.user.email}>
      <InvestorDetail investorId={id} />
    </CockpitShell>
  );
}
