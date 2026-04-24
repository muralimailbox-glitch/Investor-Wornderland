import { redirect } from 'next/navigation';

import { PipelineBoard } from '@/components/cockpit/pipeline-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pipeline — Cockpit' };

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <PipelineBoard />
    </CockpitShell>
  );
}
