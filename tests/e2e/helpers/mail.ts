import { count, desc, eq } from 'drizzle-orm';

import { db } from '../../../src/lib/db/client';
import { emailInbox, emailOutbox } from '../../../src/lib/db/schema';
import { poll } from './utils';

export async function waitForOutboxEmail(
  toEmail: string,
  subjectContains?: string,
  timeoutMs = 15_000,
) {
  return poll(
    async () => {
      const rows = await db
        .select()
        .from(emailOutbox)
        .where(eq(emailOutbox.toEmail, toEmail))
        .orderBy(desc(emailOutbox.createdAt))
        .limit(20);

      return rows.find((row) => !subjectContains || row.subject.includes(subjectContains)) ?? null;
    },
    { timeoutMs, label: `outbox:${toEmail}` },
  );
}

export async function waitForInboxEmail(
  fromEmail: string,
  subjectContains?: string,
  timeoutMs = 15_000,
) {
  return poll(
    async () => {
      const rows = await db
        .select()
        .from(emailInbox)
        .where(eq(emailInbox.fromEmail, fromEmail))
        .orderBy(desc(emailInbox.createdAt))
        .limit(20);

      return rows.find((row) => !subjectContains || row.subject.includes(subjectContains)) ?? null;
    },
    { timeoutMs, label: `inbox:${fromEmail}` },
  );
}

/** Returns the number of emailOutbox rows addressed to `toEmail`. */
export async function countOutboxEmails(toEmail: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.toEmail, toEmail));
  return row?.n ?? 0;
}

export function extractSixDigitCode(text: string): string {
  const match = text.match(/\b(\d{6})\b/);
  if (!match) throw new Error('No 6-digit OTP found');
  return match[1] as string;
}

export function extractFirstUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>]+/);
  if (!match) throw new Error('No URL found in email body');
  return match[0];
}
