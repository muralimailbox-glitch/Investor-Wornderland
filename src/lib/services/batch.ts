import { randomUUID } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { ApiError, BadRequestError, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { signInvestorLink } from '@/lib/auth/investor-link';
import { db } from '@/lib/db/client';
import { emailOutboxRepo } from '@/lib/db/repos/email-outbox';
import { auditEvents, emailOutbox, firms, investors, leads, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
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

  // Per-step logging so a 500 in prod names the exact stage that failed
  // (lead lookup vs. founder lookup vs. signing vs. enqueue vs. audit).
  const trace = (step: string, extra?: Record<string, unknown>) =>
    console.warn('[batch.create]', step, { workspaceId: input.workspaceId, ...extra });

  trace('start', { leadCount: input.leadIds.length, templateKey: input.templateKey ?? null });

  const rows = await db
    .select({
      leadId: leads.id,
      dealId: leads.dealId,
      investorId: investors.id,
      email: investors.email,
      firstName: investors.firstName,
      lastName: investors.lastName,
      firmId: firms.id,
      firmName: firms.name,
    })
    .from(leads)
    .innerJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(and(eq(leads.workspaceId, input.workspaceId), inArray(leads.id, input.leadIds)));

  trace('leads_loaded', { matched: rows.length, expected: input.leadIds.length });
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

  trace('founder_loaded', { hasFounder: founderRow.length > 0 });

  const siteBase = env.NEXT_PUBLIC_SITE_URL;
  const batchId = randomUUID();
  const outboxIds: string[] = [];
  for (const r of rows) {
    // Wrap the per-recipient pipeline so a single bad row reports *which*
    // recipient broke (instead of dragging the whole batch into a generic
    // 500) and *which* stage of personalization tripped.
    const tag = (stage: string) =>
      `[batch.create] recipient ${r.email} (lead ${r.leadId}) failed at ${stage}`;

    let link;
    try {
      link = signInvestorLink({
        investorId: r.investorId,
        workspaceId: input.workspaceId,
        dealId: r.dealId,
        leadId: r.leadId,
        firmId: r.firmId ?? null,
        firstName: r.firstName ?? '',
        lastName: r.lastName ?? null,
        firmName: r.firmName ?? null,
      });
    } catch (err) {
      console.error(tag('sign'), err);
      throw new ApiError(
        500,
        'sign_failed',
        `${tag('sign')}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const investorLink = `${siteBase}/i/${link.token}`;

    let subject = input.subject;
    let personalizedText = input.bodyText
      .replace(/\{\{firstName\}\}/g, r.firstName ?? '')
      .replace(/\{\{investorLink\}\}/g, investorLink)
      .replace(/\{\{firmName\}\}/g, r.firmName ?? '');
    let personalizedHtml: string | undefined = input.bodyHtml
      ? input.bodyHtml
          .replace(/\{\{firstName\}\}/g, r.firstName ?? '')
          .replace(/\{\{investorLink\}\}/g, investorLink)
          .replace(/\{\{firmName\}\}/g, r.firmName ?? '')
      : undefined;

    if (input.templateKey) {
      try {
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
            investorLink,
            firmName: r.firmName ?? '',
          },
        });
        subject = rendered.subject;
        personalizedText = rendered.text;
        personalizedHtml = rendered.html;
      } catch (err) {
        console.error(tag(`render(${input.templateKey})`), err);
        throw new ApiError(
          500,
          'render_failed',
          `${tag(`render(${input.templateKey})`)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (!personalizedHtml) {
      // Custom mode without an explicit HTML body: wrap the personalized text
      // in the OotaOS branded shell so the dispatched email is not plain-text.
      try {
        const branded = renderBrandedEmail({
          heading: subject,
          body: personalizedText,
          cta: [{ label: 'Open your Wonderland', href: investorLink }],
        });
        personalizedHtml = branded.html;
      } catch (err) {
        console.error(tag('brand'), err);
        throw new ApiError(
          500,
          'brand_failed',
          `${tag('brand')}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const payload: typeof emailOutbox.$inferInsert = {
      workspaceId: input.workspaceId,
      leadId: r.leadId,
      toEmail: r.email,
      subject,
      bodyText: personalizedText,
      status: 'queued',
    };
    if (personalizedHtml) payload.bodyHtml = personalizedHtml;

    let created;
    try {
      created = await emailOutboxRepo.enqueue(payload);
    } catch (err) {
      trace('enqueue_failed', {
        leadId: r.leadId,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    outboxIds.push(created.id);
  }
  trace('enqueued_all', { count: outboxIds.length });

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
      // Auto-transition + interaction trail: batch dispatch is the most
      // common email-sent path, so advance leads from prospect → contacted
      // automatically and stamp lastContactAt.
      if (row.leadId) {
        const { autoAdvanceOnEvent } = await import('@/lib/services/auto-transition');
        const { interactionsRepo } = await import('@/lib/db/repos/interactions');
        const { leadsRepo } = await import('@/lib/db/repos/leads');
        await interactionsRepo
          .record({
            workspaceId: input.workspaceId,
            leadId: row.leadId,
            kind: 'email_sent',
            payload: { toEmail: row.toEmail, subject: row.subject, messageId: info.messageId },
          })
          .catch(() => {});
        await leadsRepo.touchLastContact(input.workspaceId, row.leadId).catch(() => {});
        await autoAdvanceOnEvent(input.workspaceId, row.leadId, 'email_sent');
      }
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
