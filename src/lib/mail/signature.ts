import { env } from '@/lib/env';

export type FounderSignatureInput = {
  displayName?: string | null;
  email?: string | null;
  publicEmail?: string | null;
  whatsappE164?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  signatureMarkdown?: string | null;
};

export type RenderedSignature = {
  html: string;
  text: string;
};

const DEFAULT_WHATSAPP = '+61412766366';
const DEFAULT_COMPANY = 'OotaOS';

function whatsappHref(e164: string): string {
  return `https://wa.me/${e164.replace(/[^0-9]/g, '')}`;
}

export function buildSignature(input: FounderSignatureInput): RenderedSignature {
  const name = input.displayName?.trim() || 'The OotaOS founding team';
  const email = (input.publicEmail?.trim() || input.email?.trim() || env.SMTP_FROM).toLowerCase();
  const whatsapp = (input.whatsappE164?.trim() || DEFAULT_WHATSAPP).trim();
  const company = input.companyName?.trim() || DEFAULT_COMPANY;
  const website = input.companyWebsite?.trim() || env.NEXT_PUBLIC_SITE_URL;
  const customMd = input.signatureMarkdown?.trim();

  const waHref = whatsappHref(whatsapp);
  const siteHref = website.startsWith('http') ? website : `https://${website}`;
  const siteLabel = website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const html = `
  <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:24px;border-collapse:collapse;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
    <tr>
      <td style="padding-top:18px;border-top:1px solid #ece9f7;">
        <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#1e1b4b;">${escapeHtml(name)}</p>
        <p style="margin:0 0 10px 0;font-size:13px;color:#6b7280;">${escapeHtml(company)}</p>
        <p style="margin:0;font-size:13px;color:#1e1b4b;line-height:1.6;">
          <a href="mailto:${escapeAttr(email)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(email)}</a>
          &nbsp;·&nbsp;
          <a href="${escapeAttr(waHref)}" style="color:#16a34a;text-decoration:none;">WhatsApp ${escapeHtml(whatsapp)}</a>
          &nbsp;·&nbsp;
          <a href="${escapeAttr(siteHref)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(siteLabel)}</a>
        </p>
        ${customMd ? `<p style="margin:12px 0 0 0;font-size:13px;color:#475569;line-height:1.6;white-space:pre-line;">${escapeHtml(customMd)}</p>` : ''}
      </td>
    </tr>
  </table>`.trim();

  const text = [
    '',
    '—',
    name,
    company,
    `Email: ${email}`,
    `WhatsApp: ${whatsapp} (${waHref})`,
    `Web: ${siteHref}`,
    customMd ? `\n${customMd}` : '',
  ]
    .filter((s) => s !== '')
    .join('\n');

  return { html, text };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s);
}
