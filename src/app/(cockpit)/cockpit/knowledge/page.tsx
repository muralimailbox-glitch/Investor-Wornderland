import { redirect } from 'next/navigation';

import { KnowledgeEditor } from '@/components/cockpit/knowledge-editor';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Knowledge — Cockpit' };

export default async function KnowledgePage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <KnowledgeEditor />
    </CockpitShell>
  );
}
