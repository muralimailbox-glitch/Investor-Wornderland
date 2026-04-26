import { redirect } from 'next/navigation';

import { DealEditor } from '@/components/cockpit/deal-editor';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Deal — Cockpit' };

export default async function DealPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');
  return (
    <CockpitShell email={session.user.email}>
      <DealEditor />
    </CockpitShell>
  );
}
