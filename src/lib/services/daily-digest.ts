/**
 * Morning digest. Per-workspace summary of what the founder is walking into:
 *   - new investor questions in the last 24h
 *   - drafts pending approval
 *   - meetings today (in IST)
 *   - committed-vs-ask ($) and stage breakdown
 *   - overdue next actions (handled by /cron/reminders, summarised here)
 */
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { workspacesRepo } from '@/lib/db/repos/workspaces';
import {
  deals,
  emailOutbox,
  firms,
  interactions,
  investors,
  leads,
  meetings,
  users,
  workspaces,
} from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { sendMail } from '@/lib/mail/smtp';

export type DigestResult = {
  workspaces: number;
  digestsSent: number;
};

function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

export async function runDailyDigest(): Promise<DigestResult> {
  const result: DigestResult = { workspaces: 0, digestsSent: 0 };

  const allWorkspaces = await db.select().from(workspaces);
  if (allWorkspaces.length === 0) {
    // Fallback for single-tenant envs that use the default-workspace helper.
    const def = await workspacesRepo.default();
    if (!def) return result;
    allWorkspaces.push(def);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const istNow = new Date();
  // IST midnight today and tomorrow → window for "meetings today"
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istMidnight = new Date(
    Math.floor((istNow.getTime() + istOffsetMs) / 86_400_000) * 86_400_000 - istOffsetMs,
  );
  const istTomorrowMidnight = new Date(istMidnight.getTime() + 86_400_000);

  for (const ws of allWorkspaces) {
    const [founder] = await db
      .select({ email: users.email, firstName: users.displayName })
      .from(users)
      .where(and(eq(users.workspaceId, ws.id), eq(users.role, 'founder')))
      .limit(1);
    if (!founder?.email) continue;

    // New questions in last 24h with the asker (best-effort join)
    const newQuestions = await db
      .select({
        id: interactions.id,
        payload: interactions.payload,
        createdAt: interactions.createdAt,
        firstName: investors.firstName,
        lastName: investors.lastName,
        firmName: firms.name,
      })
      .from(interactions)
      .leftJoin(investors, eq(investors.id, interactions.investorId))
      .leftJoin(firms, eq(firms.id, investors.firmId))
      .where(
        and(
          eq(interactions.workspaceId, ws.id),
          eq(interactions.kind, 'question_asked'),
          gte(interactions.createdAt, since),
        ),
      )
      .orderBy(desc(interactions.createdAt))
      .limit(10);

    // Drafts pending approval
    const pendingDrafts = await db
      .select({ id: emailOutbox.id, subject: emailOutbox.subject, toEmail: emailOutbox.toEmail })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.workspaceId, ws.id), eq(emailOutbox.status, 'draft')))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(5);

    // Meetings today (IST)
    const todaysMeetings = await db
      .select({
        id: meetings.id,
        startsAt: meetings.startsAt,
        meetLink: meetings.meetLink,
        firstName: investors.firstName,
        lastName: investors.lastName,
        firmName: firms.name,
      })
      .from(meetings)
      .innerJoin(leads, eq(leads.id, meetings.leadId))
      .innerJoin(investors, eq(investors.id, leads.investorId))
      .leftJoin(firms, eq(firms.id, investors.firmId))
      .where(
        and(
          eq(meetings.workspaceId, ws.id),
          gte(meetings.startsAt, istMidnight),
          sql`${meetings.startsAt} < ${istTomorrowMidnight.toISOString()}`,
        ),
      )
      .orderBy(asc(meetings.startsAt));

    // Stage breakdown
    const stageCounts = await db
      .select({ stage: leads.stage, count: sql<number>`count(*)::int` })
      .from(leads)
      .where(eq(leads.workspaceId, ws.id))
      .groupBy(leads.stage);

    // Committed amount on the active deal
    const [activeDeal] = await db
      .select({ ask: deals.targetSizeUsd, dealCommitted: deals.committedUsd })
      .from(deals)
      .where(eq(deals.workspaceId, ws.id))
      .orderBy(desc(deals.createdAt))
      .limit(1);

    const committedRow = await db
      .select({
        committed: sql<number>`coalesce(sum(${leads.committedUsd}), 0)::bigint::int`,
        funded: sql<number>`coalesce(sum(${leads.fundedAmountUsd}), 0)::bigint::int`,
      })
      .from(leads)
      .where(eq(leads.workspaceId, ws.id));
    const committedFromLeads = committedRow[0]?.committed ?? 0;
    const funded = committedRow[0]?.funded ?? 0;
    const committed = Math.max(committedFromLeads, activeDeal?.dealCommitted ?? 0);
    const ask = activeDeal?.ask ?? 0;

    // Build digest content
    const facts: Array<[string, string]> = [];
    if (ask > 0) {
      facts.push([
        'Round progress',
        `${formatUsd(funded)} funded · ${formatUsd(committed)} committed of ${formatUsd(ask)}`,
      ]);
    }
    facts.push([
      'Pipeline',
      stageCounts.map((s) => `${s.stage.replace(/_/g, ' ')}: ${s.count}`).join(' · ') ||
        'no leads yet',
    ]);
    facts.push(['Drafts pending', String(pendingDrafts.length)]);
    facts.push(['Meetings today', String(todaysMeetings.length)]);
    facts.push(['New questions (24h)', String(newQuestions.length)]);

    const meetingLines = todaysMeetings
      .slice(0, 5)
      .map((m) => {
        const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'investor';
        const firmLabel = m.firmName ? ` (${m.firmName})` : '';
        const t = new Intl.DateTimeFormat(undefined, {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(m.startsAt));
        return `• ${t} IST — ${name}${firmLabel}`;
      })
      .join('\n');

    const questionLines = newQuestions
      .slice(0, 5)
      .map((q) => {
        const text = (q.payload as { question?: unknown } | null)?.question;
        const who = `${q.firstName ?? ''} ${q.lastName ?? ''}`.trim() || 'anonymous';
        const firmLabel = q.firmName ? ` (${q.firmName})` : '';
        return `• ${who}${firmLabel}: "${typeof text === 'string' ? text.slice(0, 110) : '(no text)'}"`;
      })
      .join('\n');

    let body = `Good morning${founder.firstName ? `, ${founder.firstName}` : ''}.\n\nHere's the state of the round.`;
    if (todaysMeetings.length > 0) body += `\n\nMEETINGS TODAY\n${meetingLines}`;
    if (newQuestions.length > 0) body += `\n\nLATEST QUESTIONS\n${questionLines}`;
    if (pendingDrafts.length > 0) {
      body += `\n\n${pendingDrafts.length} draft${pendingDrafts.length === 1 ? '' : 's'} awaiting your approval — open the cockpit to ship them.`;
    }

    const email = renderBrandedEmail({
      heading: `OotaOS — your morning digest`,
      body,
      facts,
      cta: [
        { label: 'Open the cockpit', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit` },
        { label: 'Drafts queue', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/drafts` },
        { label: 'Meetings', href: `${env.NEXT_PUBLIC_SITE_URL}/cockpit/meetings` },
      ],
      preFooter: 'Daily at 8 AM IST. Reply to this email if you want a different cadence.',
    });

    try {
      await sendMail({
        to: founder.email,
        subject: `OotaOS — ${todaysMeetings.length} meeting${todaysMeetings.length === 1 ? '' : 's'} today, ${pendingDrafts.length} draft${pendingDrafts.length === 1 ? '' : 's'} pending`,
        text: email.text,
        html: email.html,
      });
      result.digestsSent++;
    } catch (err) {
      console.warn('[digest] send failed for workspace', ws.id, err);
    }
    result.workspaces++;
  }

  return result;
}
