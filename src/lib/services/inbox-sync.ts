/**
 * Pull unseen messages from the shared Zoho inbox and attach each one to a
 * lead by matching the sender email against `investors.email`. Records an
 * `email_received` interaction, advances the lead's stage if applicable, and
 * marks the message as Seen so we don't re-process on the next poll.
 *
 * Threading by Message-ID / In-Reply-To would be ideal, but `email_outbox`
 * doesn't currently capture our outbound message-ids. Sender-address
 * matching is a 95%-correct fallback and the missing 5% (forwards from a
 * different address) get caught by the founder reading the timeline.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { ImapFlow } from 'imapflow';

import { db } from '@/lib/db/client';
import { interactionsRepo } from '@/lib/db/repos/interactions';
import { leadsRepo } from '@/lib/db/repos/leads';
import { investors, leads } from '@/lib/db/schema';
import { env, requireEnv } from '@/lib/env';

import { autoAdvanceOnEvent } from './auto-transition';
import { cancelCadencesForLead } from './cadences';

export type InboxSyncResult = {
  scanned: number;
  attached: number;
  skipped: number;
  errors: string[];
};

const FROM_RE = /<([^>]+)>/;

function parseFromAddress(
  envFrom: { address?: string; name?: string }[] | undefined,
): string | null {
  const first = envFrom?.[0];
  if (!first) return null;
  const direct = first.address?.trim().toLowerCase();
  if (direct) return direct;
  // Some servers stuff the angle-bracket form into the name field
  const m = (first.name ?? '').match(FROM_RE);
  return m?.[1]?.toLowerCase() ?? null;
}

export async function runInboxSync(): Promise<InboxSyncResult> {
  const result: InboxSyncResult = { scanned: 0, attached: 0, skipped: 0, errors: [] };

  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: true,
    auth: { user: env.IMAP_USER, pass: requireEnv('IMAP_PASS') },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      result.scanned = uids.length;

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(
            String(uid),
            { uid: true, envelope: true, internalDate: true, flags: true },
            { uid: true },
          );
          if (!msg) continue;

          const fromAddr = parseFromAddress(msg.envelope?.from as never);
          const subject = (msg.envelope?.subject ?? '(no subject)').slice(0, 300);
          const messageId = msg.envelope?.messageId ?? null;
          const inReplyTo = msg.envelope?.inReplyTo ?? null;

          if (!fromAddr) {
            result.skipped++;
            continue;
          }

          // Look up the investor case-insensitively.
          const [inv] = await db
            .select({
              id: investors.id,
              workspaceId: investors.workspaceId,
            })
            .from(investors)
            .where(sql`lower(${investors.email}) = ${fromAddr}`)
            .limit(1);

          if (!inv) {
            // Unknown sender — leave Unseen so the founder triages it.
            result.skipped++;
            continue;
          }

          // Active lead = most recently touched, regardless of stage.
          const [lead] = await db
            .select({ id: leads.id })
            .from(leads)
            .where(and(eq(leads.workspaceId, inv.workspaceId), eq(leads.investorId, inv.id)))
            .orderBy(desc(leads.stageEnteredAt))
            .limit(1);

          if (!lead) {
            result.skipped++;
            continue;
          }

          await interactionsRepo.record({
            workspaceId: inv.workspaceId,
            investorId: inv.id,
            leadId: lead.id,
            kind: 'email_received',
            payload: {
              fromEmail: fromAddr,
              subject,
              messageId,
              inReplyTo,
              receivedAt:
                msg.internalDate instanceof Date
                  ? msg.internalDate.toISOString()
                  : typeof msg.internalDate === 'string'
                    ? new Date(msg.internalDate).toISOString()
                    : new Date().toISOString(),
              imapUid: uid,
            },
          });

          await leadsRepo.touchLastContact(inv.workspaceId, lead.id).catch(() => {});
          await autoAdvanceOnEvent(inv.workspaceId, lead.id, 'email_received').catch(() => {});
          // Reply received → halt any in-flight drip cadence so we don't
          // keep poking after they've already responded.
          await cancelCadencesForLead(inv.workspaceId, lead.id).catch(() => {});

          // Mark Seen so we don't re-process next poll.
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
          result.attached++;
        } catch (err) {
          result.errors.push(`uid ${uid}: ${(err as Error).message.slice(0, 120)}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {
      /* swallow */
    });
  }

  return result;
}
