import { redirect } from 'next/navigation';

import { FeedbackInbox } from '@/components/cockpit/feedback-inbox';
import { CockpitShell } from '@/components/cockpit/shell';
import { getSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feedback — Cockpit' };

export default async function FeedbackPage() {
  const session = await getSession();
  if (!session) redirect('/cockpit/login');

  return (
    <CockpitShell email={session.user.email}>
      <FeedbackInbox />
    </CockpitShell>
  );
}
