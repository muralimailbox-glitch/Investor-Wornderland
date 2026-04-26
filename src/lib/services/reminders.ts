/**
 * Daily reminder dispatch. For every lead whose nextActionDue is in the past
 * and which is not in a terminal stage, send the founder one branded
 * "you owe these investors a move" email — bundled, not one per lead, so
 * the inbox doesn't explode.
 */
import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { firms, investors, leads, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type RemindersResult = {
  workspaces: number;
  remindersDispatched: number;
  rowsFlagged: number;
};

const TERMINAL = ['funded', 'closed_lost'] as const;

export async function runReminderDispatch(): Promise<RemindersResult> {
  const result: RemindersResult = { workspaces: 0, remindersDispatched: 0, rowsFlagged: 0 };

  const now = new Date();

  // Group by workspace so each founder gets one bundled email.
  const due = await db
    .select({
      leadId: leads.id,
      workspaceId: leads.workspaceId,
      stage: leads.stage,
      nextActionDue: leads.nextActionDue,
      nextActionOwner: leads.nextActionOwner,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      investorEmail: investors.email,
      firmName: firms.name,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(
      and(
        sql`${leads.nextActionDue} IS NOT NULL`,
        lt(leads.nextActionDue, now),
        ne(leads.stage, TERMINAL[0]),
        ne(leads.stage, TERMINAL[1]),
      ),
    )
    .orderBy(asc(leads.nextActionDue));

  result.rowsFlagged = due.length;
  if (due.length === 0) return result;

  const byWorkspace = new Map<string, typeof due>();
  for (const r of due) {
    const arr = byWorkspace.get(r.workspaceId) ?? [];
    arr.push(r);
    byWorkspace.set(r.workspaceId, arr);
  }

  for (const [workspaceId, items] of byWorkspace) {
    const [founder] = await db
      .select({ email: users.email, firstName: users.displayName })
      .from(users)
      .where(and(eq(users.workspaceId, workspaceId), eq(users.role, 'founder')))
      .limit(1);
    const founderEmail = founder?.email ?? env.SMTP_FROM;
    const founderFirstName = founder?.firstName ?? 'Founder';

    const facts: Array<[string, string]> = items.slice(0, 12).map((it) => {
      const name =
        `${it.investorFirstName ?? ''} ${it.investorLastName ?? ''}`.trim() || it.investorEmail;
      const firmLabel = it.firmName ? ` — ${it.firmName}` : '';
      const dueLabel = it.nextActionDue
        ? new Date(it.nextActionDue).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : 'overdue';
      return [`${name}${firmLabel}`, `${it.stage.replace(/_/g, ' ')} · due ${dueLabel}`];
    });
    const overflow = items.length > facts.length ? `\n+${items.length - facts.length} more.` : '';

    const body = `You have ${items.length} lead${items.length === 1 ? '' : 's'} with a next-action due. Nothing dropped — just a nudge to either move them or reset the deadline.${overflow}`;

    const email = renderBrandedEmail({
      heading: `${founderFirstName} — ${items.length} action${items.length === 1 ? '' : 's'} due in your pipeline`,
      body,
      facts,
      cta: [
        { label: 'Open the pipeline', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/pipeline` },
        { label: 'Drafts &amp; outbox', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/drafts` },
      ],
      preFooter:
        'This nudge fires once a day at 8 AM IST. Adjust due dates inline on each lead row to silence them.',
    });

    try {
      await sendMail({
        to: founderEmail,
        subject: `OotaOS pipeline: ${items.length} action${items.length === 1 ? '' : 's'} due`,
        text: email.text,
        html: email.html,
      });
      result.remindersDispatched++;
    } catch (err) {
      console.warn('[reminders] dispatch failed for workspace', workspaceId, err);
    }
    result.workspaces++;
  }

  return result;
}
