import { ImapFlow, type FetchMessageObject } from 'imapflow';

import { env, requireEnv } from '@/lib/env';

/**
 * Lightweight IMAP client for polling the shared inbox. Each call opens a
 * fresh connection; the poll worker (pg-boss job) invokes `fetchUnseen()`
 * on its schedule and the connection is torn down on exit.
 */
export async function fetchUnseen(): Promise<FetchMessageObject[]> {
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: true,
    auth: { user: env.IMAP_USER, pass: requireEnv('IMAP_PASS') },
    logger: false,
  });

  await client.connect();
  const messages: FetchMessageObject[] = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
      for (const uid of uids) {
        const msg = await client.fetchOne(
          String(uid),
          { uid: true, envelope: true, internalDate: true, source: true, flags: true },
          { uid: true },
        );
        if (msg) messages.push(msg);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {
      /* swallow close errors */
    });
  }
  return messages;
}

export async function verifyImap(): Promise<boolean> {
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: true,
    auth: { user: env.IMAP_USER, pass: requireEnv('IMAP_PASS') },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch (err) {
    console.error('[imap] verify failed:', err);
    return false;
  }
}
