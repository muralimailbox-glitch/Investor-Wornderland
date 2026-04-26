/**
 * Drip cadences. Stored as N email_outbox rows sharing a cadenceGroupId,
 * each with a `scheduledFor` timestamp. Each row starts in status='draft'
 * (so the founder must approve the whole sequence) and flips to 'approved'
 * → 'sent' over time as the cron pump runs.
 *
 * Cancellation: any inbound reply (`email_received`) on the same lead
 * flips remaining cadence rows to status='cancelled', so the investor
 * doesn't get more drips after replying. Stage advance to a terminal stage
 * does the same.
 */
import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { emailOutbox } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail/smtp';

export type CadenceStep = {
  /** When relative to "now" in days. 0 = today, 3 = three days later, etc. */
  dayOffset: number;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
};

export type EnqueueCadenceInput = {
  workspaceId: string;
  leadId: string;
  toEmail: string;
  steps: CadenceStep[];
};

export type EnqueueCadenceResult = {
  cadenceGroupId: string;
  stepIds: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enqueue all steps in a cadence as drafts. The founder must approve
 * the cadence as a unit (we expose a single "approve cadence" CTA in the
 * drafts queue) — once approved, the cron pump dispatches each step at
 * its scheduledFor.
 */
export async function enqueueCadence(input: EnqueueCadenceInput): Promise<EnqueueCadenceResult> {
  if (input.steps.length === 0) throw new Error('cadence_empty');
  const cadenceGroupId = randomUUID();
  const now = Date.now();

  const inserts = input.steps.map((step, i) => {
    const scheduledFor = new Date(now + step.dayOffset * DAY_MS);
    const row: typeof emailOutbox.$inferInsert = {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      toEmail: input.toEmail,
      subject: step.subject,
      bodyText: step.bodyText,
      ...(step.bodyHtml ? { bodyHtml: step.bodyHtml } : {}),
      status: 'draft',
      scheduledFor,
      cadenceGroupId,
      stepIndex: i,
    };
    return row;
  });
  const rows = await db.insert(emailOutbox).values(inserts).returning({ id: emailOutbox.id });
  return {
    cadenceGroupId,
    stepIds: rows.map((r) => r.id),
  };
}

export type DispatchResult = {
  scanned: number;
  sent: number;
  failed: number;
};

/**
 * Drains approved cadence rows whose scheduled_for has arrived.
 * Idempotent — only flips approved → sent on success.
 */
export async function dispatchDueCadences(): Promise<DispatchResult> {
  const result: DispatchResult = { scanned: 0, sent: 0, failed: 0 };
  const now = new Date();

  const due = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, 'approved'), lte(emailOutbox.scheduledFor, now)))
    .orderBy(asc(emailOutbox.scheduledFor))
    .limit(50);

  result.scanned = due.length;

  for (const row of due) {
    try {
      const args: Parameters<typeof sendMail>[0] = {
        to: row.toEmail,
        subject: row.subject,
        text: row.bodyText,
      };
      if (row.bodyHtml) args.html = row.bodyHtml;
      await sendMail(args);
      await db
        .update(emailOutbox)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(emailOutbox.id, row.id));
      result.sent++;
    } catch (err) {
      await db
        .update(emailOutbox)
        .set({ status: 'failed', lastError: (err as Error).message.slice(0, 500) })
        .where(eq(emailOutbox.id, row.id));
      result.failed++;
    }
  }

  return result;
}

/**
 * Cancel any pending steps in cadences targeting this lead. Called on
 * inbound reply or terminal-stage transition so we don't keep dripping.
 * Returns the count of cancelled rows.
 */
export async function cancelCadencesForLead(workspaceId: string, leadId: string): Promise<number> {
  const result = await db
    .update(emailOutbox)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(emailOutbox.workspaceId, workspaceId),
        eq(emailOutbox.leadId, leadId),
        isNotNull(emailOutbox.cadenceGroupId),
        sql`${emailOutbox.status} IN ('draft', 'approved')`,
      ),
    )
    .returning({ id: emailOutbox.id });
  return result.length;
}
