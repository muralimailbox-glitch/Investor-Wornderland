import { redirect } from 'next/navigation';

import { Dashboard } from '@/components/cockpit/dashboard';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';
import { dealsRepo } from '@/lib/db/repos/deals';
import { leadsRepo } from '@/lib/db/repos/leads';

export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  const [deals, leads] = await Promise.all([
    dealsRepo.activeForWorkspace(session.user.workspaceId),
    leadsRepo.pipeline(session.user.workspaceId),
  ]);

  const byStage = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.stage] = (acc[lead.stage] ?? 0) + 1;
    return acc;
  }, {});

  const deal = deals[0]
    ? {
        id: deals[0].id,
        roundSizeUsd: deals[0].targetSizeUsd,
        stage: deals[0].roundLabel,
        closeInDays: null as number | null,
      }
    : null;

  return (
    <CockpitShell email={session.user.email}>
      <Dashboard
        user={{ email: session.user.email, role: session.user.role }}
        deal={deal}
        leadCount={leads.length}
        byStage={byStage}
      />
    </CockpitShell>
  );
}
