import nodemailer, { type Transporter } from 'nodemailer';

import { env, requireEnv } from '@/lib/env';

let cached: Transporter | null = null;

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
  if (mail.html !== undefined) options.html = mail.html;
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
