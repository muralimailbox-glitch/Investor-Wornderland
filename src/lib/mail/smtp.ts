import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import nodemailer, { type Transporter } from 'nodemailer';

import { env, requireEnv } from '@/lib/env';
import { LOGO_CID, LOGO_FILE } from '@/lib/mail/brand';

let cached: Transporter | null = null;

// Read the logo once at module load. The file ships in `public/brand/`,
// which is also where Next serves it from for non-email surfaces. Reading
// synchronously here is fine — it's a one-time cost on first import, and
// the file is ~200 KB. If the read fails (file missing in some build), we
// fall back to no-attachment so mail still flows; the HTML alt text keeps
// the wordmark visible.
let cachedLogo: { content: Buffer; cid: string; filename: string } | null = null;
function loadLogoAttachment(): { content: Buffer; cid: string; filename: string } | null {
  if (cachedLogo !== null) return cachedLogo;
  try {
    const path = join(process.cwd(), 'public', 'brand', LOGO_FILE);
    cachedLogo = { content: readFileSync(path), cid: LOGO_CID, filename: LOGO_FILE };
    return cachedLogo;
  } catch (err) {
    console.error('[smtp] failed to load inline logo:', err);
    return null;
  }
}

function transport(): Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: requireEnv('SMTP_PASS'),
    },
  });
  return cached;
}

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendMail(mail: OutboundMail): Promise<{ messageId: string }> {
  const tx = transport();
  const options: Parameters<typeof tx.sendMail>[0] = {
    from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  };
  if (mail.html !== undefined) {
    options.html = mail.html;
    // The branded shell references `cid:ootaos-logo`; attach the file as
    // an inline part so the logo renders even when remote images are
    // blocked. Only attach when an HTML body is present — text-only
    // emails wouldn't display it anyway.
    const logo = loadLogoAttachment();
    if (logo) {
      options.attachments = [
        {
          filename: logo.filename,
          content: logo.content,
          cid: logo.cid,
          contentType: 'image/png',
        },
      ];
    }
  }
  if (mail.replyTo !== undefined) options.replyTo = mail.replyTo;
  const info = await tx.sendMail(options);
  return { messageId: info.messageId };
}

export async function verifySmtp(): Promise<boolean> {
  try {
    await transport().verify();
    return true;
  } catch (err) {
    console.error('[smtp] verify failed:', err);
    return false;
  }
}
