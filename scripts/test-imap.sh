#!/usr/bin/env bash
# test-imap.sh - Connects to Zoho IMAP and lists the last 5 INBOX messages.
set -uo pipefail

[ -f .env ] && set -a && . ./.env && set +a

: "${IMAP_HOST:?IMAP_HOST required}"
: "${IMAP_PORT:?IMAP_PORT required}"
: "${IMAP_USER:?IMAP_USER required}"
: "${IMAP_PASS:?IMAP_PASS required (use Zoho App Password)}"

cat <<JS | node
const { ImapFlow } = require('imapflow');
(async () => {
  const c = new ImapFlow({
    host: '$IMAP_HOST', port: $IMAP_PORT, secure: true,
    auth: { user: '$IMAP_USER', pass: process.env.IMAP_PASS },
    logger: false,
  });
  try {
    await c.connect();
    const lock = await c.getMailboxLock('INBOX');
    try {
      const status = await c.status('INBOX', { messages: true });
      console.log('INBOX messages:', status.messages);
      const seq = Math.max(1, status.messages - 4) + ':' + status.messages;
      let count = 0;
      for await (const msg of c.fetch(seq, { envelope: true, uid: true })) {
        count++;
        console.log(' uid', msg.uid, '|', msg.envelope.from?.[0]?.address || '?', '|', msg.envelope.subject || '(no subject)');
      }
      console.log('OK fetched', count, 'messages');
    } finally { lock.release(); }
    await c.logout();
  } catch (e) {
    console.error('IMAP FAILED:', e.message);
    process.exit(1);
  }
})();
JS
