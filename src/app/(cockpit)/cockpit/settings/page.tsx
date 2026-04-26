import { redirect } from 'next/navigation';

import { SettingsForm } from '@/components/cockpit/settings-form';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Cockpit' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');
  return (
    <CockpitShell email={session.user.email}>
      <SettingsForm />
    </CockpitShell>
  );
}
