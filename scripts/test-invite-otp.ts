/**
 * test-invite-otp.ts — End-to-end smoke of the invite OTP flow.
 *
 * 1. Issues an OTP (DB round-trip into rate_limits).
 * 2. Sends the verification email via SMTP (mirrors /api/v1/invite/otp/start).
 * 3. Re-reads the OTP via verifyOtp (DB round-trip).
 * 4. Confirms the code matched and was cleared.
 *
 * Run with: pnpm tsx scripts/test-invite-otp.ts [email]
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Ensure .env.local is loaded on top of dotenv/config.
try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const k = m[1];
    let v = m[2] ?? '';
    if (!k) continue;
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {
  // .env.local optional
}

async function main() {
  const { issueOtp, verifyOtp } = await import('@/lib/auth/otp');
  const { sendMail } = await import('@/lib/mail/smtp');

  const recipient = process.argv[2] ?? process.env.SMOKE_TEST_RECIPIENT ?? process.env.SMTP_FROM;
  if (!recipient) {
    console.error('recipient required (arg or SMOKE_TEST_RECIPIENT or SMTP_FROM)');
    process.exit(1);
  }

  console.log(`[invite-otp-test] recipient: ${recipient}`);

  // --- 1. Issue OTP ---
  const code = await issueOtp(recipient);
  console.log(`[invite-otp-test] issued code (DB write OK): ${code}`);

  // --- 2. Send email (same body as /api/v1/invite/otp/start) ---
  const firstName = 'Krish';
  const { messageId } = await sendMail({
    to: recipient,
    subject: `Your OotaOS verification code: ${code}`,
    text: [
      `Hi ${firstName},`,
      '',
      `Your OotaOS verification code is: ${code}`,
      '',
      'Enter this code to unlock deeper details about the round. It expires in 10 minutes.',
      'If you did not request this, you can safely ignore this email.',
      '',
      '— OotaOS',
    ].join('\n'),
    html: `<!doctype html>
<html><body style="font-family:-apple-system,Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#111">
  <h1 style="font-size:18px;letter-spacing:-0.01em;margin:0 0 16px">Hi ${firstName} — your verification code</h1>
  <p style="font-size:14px;line-height:1.6;color:#333">Enter this code to unlock deeper details. It expires in 10 minutes.</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:0.2em;background:linear-gradient(135deg,#8b5cf6,#ec4899);-webkit-background-clip:text;color:transparent;margin:24px 0">${code}</p>
  <p style="font-size:12px;color:#666">If you did not request this, ignore this email.</p>
</body></html>`,
  });
  console.log(`[invite-otp-test] SMTP send OK — messageId=${messageId}`);

  // --- 3. Verify OTP (good path) ---
  const goodMatch = await verifyOtp(recipient, code);
  console.log(`[invite-otp-test] verifyOtp(correct code) → ${goodMatch}`);
  if (!goodMatch) {
    console.error('[invite-otp-test] FAIL — correct code did not verify');
    process.exit(1);
  }

  // --- 4. Verify OTP again (should fail — one-shot consumption) ---
  const secondUse = await verifyOtp(recipient, code);
  console.log(`[invite-otp-test] verifyOtp(same code reused) → ${secondUse} (expected false)`);
  if (secondUse) {
    console.error('[invite-otp-test] FAIL — OTP was not consumed after first verify');
    process.exit(1);
  }

  // --- 5. Verify wrong code ---
  const fresh = await issueOtp(recipient);
  const wrongCode = fresh === '000000' ? '111111' : '000000';
  const badMatch = await verifyOtp(recipient, wrongCode);
  console.log(`[invite-otp-test] verifyOtp(wrong code) → ${badMatch} (expected false)`);
  if (badMatch) {
    console.error('[invite-otp-test] FAIL — wrong code verified');
    process.exit(1);
  }
  // clean up fresh code
  await verifyOtp(recipient, fresh);

  console.log('\n[invite-otp-test] ✅ OTP flow end-to-end OK');
  process.exit(0);
}

main().catch((e) => {
  console.error('[invite-otp-test] FAIL:', e);
  process.exit(1);
});
