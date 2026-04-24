#!/usr/bin/env bash
# test-smtp.sh - Sends a real test email via Zoho SMTP.
# Set SMOKE_TEST_RECIPIENT=youremail@x.com to override the default.
set -uo pipefail

if [ -f .env.local ]; then set -a && . ./.env.local && set +a; fi
if [ -f .env ]; then set -a && . ./.env && set +a; fi

: "${SMTP_HOST:?SMTP_HOST required}"
: "${SMTP_PORT:?SMTP_PORT required}"
: "${SMTP_USER:?SMTP_USER required}"
: "${SMTP_PASS:?SMTP_PASS required (use Zoho App Password, not account password)}"
: "${SMTP_FROM:?SMTP_FROM required}"

RCPT="${SMOKE_TEST_RECIPIENT:-$SMTP_FROM}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat <<JS | node
const nodemailer = require('nodemailer');
(async () => {
  const tx = nodemailer.createTransport({
    host: '$SMTP_HOST', port: $SMTP_PORT, secure: ${SMTP_SECURE:-true},
    auth: { user: '$SMTP_USER', pass: process.env.SMTP_PASS },
  });
  try {
    const info = await tx.sendMail({
      from: { name: '${SMTP_FROM_NAME:-OotaOS}', address: '$SMTP_FROM' },
      to: '$RCPT',
      subject: 'OotaOS SMTP test — $TS',
      text: 'If you received this, Zoho SMTP is wired correctly.\n\nTimestamp: $TS\nFrom: $SMTP_FROM\nHost: $SMTP_HOST',
    });
    console.log('OK message-id:', info.messageId);
  } catch (e) {
    console.error('SMTP send FAILED:', e.message);
    process.exit(1);
  }
})();
JS
