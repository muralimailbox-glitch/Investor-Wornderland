import { redirect } from 'next/navigation';

import { AuditBoard } from '@/components/cockpit/audit-board';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log — Cockpit' };

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');
  return (
    <CockpitShell email={session.user.email}>
      <AuditBoard />
    </CockpitShell>
  );
}
