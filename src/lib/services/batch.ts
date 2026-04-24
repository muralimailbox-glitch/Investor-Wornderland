import { randomUUID } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { ApiError, BadRequestError, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db/client';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { auditEvents, emailOutbox, investors, leads, users } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail/smtp';
import { renderByKey, type TemplateKey } from '@/lib/mail/templates';

export const MAX_BATCH_SIZE = 50;

export type CreateBatchInput = {
  workspaceId: string;
  actorUserId: string;
  leadIds: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  templateKey?: TemplateKey;
};

export type BatchSummary = {
  batchId: string;
  outboxIds: string[];
  recipients: Array<{ email: string; leadId: string }>;
};

export async function createBatch(input: CreateBatchInput): Promise<BatchSummary> {
  if (input.leadIds.length === 0) throw new BadRequestError('empty_batch');
  if (input.leadIds.length > MAX_BATCH_SIZE) throw new BadRequestError('batch_too_large');

  const rows = await db
    .select({
      leadId: leads.id,
      email: investors.email,
      firstName: investors.firstName,
      lastName: investors.lastName,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .where(and(eq(leads.workspaceId, input.workspaceId), inArray(leads.id, input.leadIds)));

  if (rows.length !== input.leadIds.length) {
    throw new NotFoundError('lead_missing');
  }

  const founderRow = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      publicEmail: users.publicEmail,
      whatsappE164: users.whatsappE164,
      signatureMarkdown: users.signatureMarkdown,
      companyName: users.companyName,
      companyWebsite: users.companyWebsite,
      companyAddress: users.companyAddress,
    })
    .from(users)
    .where(and(eq(users.workspaceId, input.workspaceId), eq(users.role, 'founder')))
    .limit(1);
  const founder = founderRow[0] ?? {
    displayName: null,
    email: null,
    publicEmail: null,
    whatsappE164: null,
    signatureMarkdown: null,
    companyName: null,
    companyWebsite: null,
    companyAddress: null,
  };

  const batchId = randomUUID();
  const outboxIds: string[] = [];
  for (const r of rows) {
    let subject = input.subject;
    let personalizedText = input.bodyText.replace(/\{\{firstName\}\}/g, r.firstName ?? '');
    let personalizedHtml: string | undefined = input.bodyHtml
      ? input.bodyHtml.replace(/\{\{firstName\}\}/g, r.firstName ?? '')
      : undefined;

    if (input.templateKey) {
      const rendered = renderByKey(input.templateKey, {
        firstName: r.firstName,
        lastName: r.lastName,
        founder,
        companyName: founder.companyName,
        physicalAddress: founder.companyAddress,
        extras: {
          subject: input.subject,
          heading: '',
          body: input.bodyText,
        },
      });
      subject = rendered.subject;
      personalizedText = rendered.text;
      personalizedHtml = rendered.html;
    }

    const payload: typeof emailOutbox.$inferInsert = {
      workspaceId: input.workspaceId,
      toEmail: r.email,
      subject,
      bodyText: personalizedText,
      status: 'queued',
    };
    if (personalizedHtml) payload.bodyHtml = personalizedHtml;

    const created = await emailOutboxRepo.enqueue(payload);
    outboxIds.push(created.id);
  }

  await audit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: 'batch.created',
    targetType: 'batch',
    targetId: batchId,
    payload: {
      outboxIds,
      leadIds: input.leadIds,
      subject: input.subject,
      templateKey: input.templateKey ?? null,
    },
  });

  return {
    batchId,
    outboxIds,
    recipients: rows.map((r) => ({ email: r.email, leadId: r.leadId })),
  };
}

export async function dispatchBatch(input: {
  workspaceId: string;
  actorUserId: string;
  batchId: string;
}): Promise<{
  sent: number;
  failed: number;
  details: Array<{ outboxId: string; ok: boolean; messageId?: string; error?: string }>;
}> {
  const batchEvent = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        eq(auditEvents.action, 'batch.created'),
        eq(auditEvents.targetId, input.batchId),
      ),
    )
    .limit(1);

  if (!batchEvent[0]) throw new NotFoundError('batch_not_found');

  const payload = batchEvent[0].payload as { outboxIds?: string[] } | null;
  const outboxIds = payload?.outboxIds ?? [];
  if (outboxIds.length === 0) throw new ApiError(409, 'batch_empty');

  const rows = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.workspaceId, input.workspaceId), inArray(emailOutbox.id, outboxIds)));

  const details: Array<{ outboxId: string; ok: boolean; messageId?: string; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.status === 'sent') {
      details.push({ outboxId: row.id, ok: true });
      continue;
    }
    try {
      const sendArgs: Parameters<typeof sendMail>[0] = {
        to: row.toEmail,
        subject: row.subject,
        text: row.bodyText,
      };
      if (row.bodyHtml) sendArgs.html = row.bodyHtml;
      const info = await sendMail(sendArgs);
      await db
        .update(emailOutbox)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(emailOutbox.id, row.id));
      details.push({ outboxId: row.id, ok: true, messageId: info.messageId });
      sent++;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      await db
        .update(emailOutbox)
        .set({
          status: 'failed',
          lastError: msg,
          attempts: sql`${emailOutbox.attempts} + 1`,
        })
        .where(eq(emailOutbox.id, row.id));
      details.push({ outboxId: row.id, ok: false, error: msg });
      failed++;
    }
  }

  await audit({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: 'batch.dispatched',
    targetType: 'batch',
    targetId: input.batchId,
    payload: { sent, failed },
  });

  return { sent, failed, details };
}
