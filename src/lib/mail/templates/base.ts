import { env } from '@/lib/env';
import { MARKETING_SITE_URL, OOTAOS_BRAND } from '@/lib/mail/brand';
import { buildSignature, escapeHtml, type FounderSignatureInput } from '@/lib/mail/signature';

export type TemplateVars = {
  firstName?: string | null;
  lastName?: string | null;
  founder: FounderSignatureInput;
  companyName?: string | null;
  unsubscribeUrl?: string | null;
  physicalAddress?: string | null;
  preheader?: string | null;
};

export type TemplateBody = {
  subject: string;
  heading?: string;
  /** HTML fragment — will be wrapped by renderBaseLayout. */
  bodyHtml: string;
  /** Plain-text equivalent. */
  bodyText: string;
  /** Optional CTA rendered as a prominent button. */
  cta?: { label: string; href: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };

// Single source of truth lives in @/lib/mail/brand. Local alias keeps
// the existing template code readable and pulls the same hex values
// branded-email.ts uses, so transactional and outreach emails match.
const BRAND = {
  primary: OOTAOS_BRAND.accentFrom,
  accent: OOTAOS_BRAND.accentTo,
  gradient: OOTAOS_BRAND.gradient,
  ink: OOTAOS_BRAND.ink,
  muted: OOTAOS_BRAND.inkSoft,
  surface: OOTAOS_BRAND.bgCard,
  page: OOTAOS_BRAND.bgPage,
  border: OOTAOS_BRAND.border,
} as const;

function renderBaseLayout(body: TemplateBody, vars: TemplateVars): string {
  const signature = buildSignature(vars.founder);
  const company = vars.companyName ?? vars.founder.companyName ?? 'OotaOS';
  const physical =
    vars.physicalAddress ?? vars.founder.companyName ?? 'OotaOS, Perth WA, Australia';
  const unsubscribe = vars.unsubscribeUrl ?? `${env.NEXT_PUBLIC_SITE_URL}/unsubscribe`;
  const preheader = vars.preheader ?? '';
  // Absolute URL to the OotaOS logo asset shipped under /public/brand. Email
  // clients must fetch over https and cannot resolve relative paths.
  const siteBase = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  const logoUrl = `${siteBase}/brand/oota-light.png`;

  const ctaHtml = body.cta
    ? `<p style="margin:28px 0 8px 0;">
         <a href="${body.cta.href}" style="display:inline-block;padding:12px 24px;background:${BRAND.gradient};color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;box-shadow:0 10px 26px -14px rgba(225,29,72,0.55);">${escapeHtml(body.cta.label)}</a>
       </p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(body.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.page};font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BRAND.surface};border-radius:20px;overflow:hidden;box-shadow:0 20px 60px -30px rgba(91,33,182,0.35);">
            <tr>
              <td style="padding:28px 36px;background:${BRAND.gradient};color:#fff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <!-- Header brand-mark links to www.ootaos.com (the public
                           product site). The investor-relations app
                           (siteBase) lives in the footer for context. -->
                      <a href="${MARKETING_SITE_URL}" style="text-decoration:none;color:#fff;display:inline-block;">
                        <span style="font-size:22px;font-weight:800;letter-spacing:0.02em;color:#fff;">${escapeHtml(company)}</span>
                      </a>
                      <img src="${logoUrl}" alt="" width="0" height="0" style="display:none;max-height:0;max-width:0;overflow:hidden;" />
                    </td>
                    <td align="right" style="vertical-align:middle;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.2em;opacity:0.85;">Investor Wonderland</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 16px 36px;">
                ${body.heading ? `<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${BRAND.ink};">${escapeHtml(body.heading)}</h1>` : ''}
                <div style="font-size:15px;line-height:1.65;color:${BRAND.ink};">
                  ${body.bodyHtml}
                </div>
                ${ctaHtml}
                ${signature.html}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px;background:${BRAND.page};border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.muted};">
                <p style="margin:0 0 6px 0;">${escapeHtml(physical)}</p>
                <p style="margin:0;">
                  <a href="${siteBase}" style="color:${BRAND.muted};text-decoration:underline;">investors.ootaos.com</a>
                  &nbsp;·&nbsp;
                  <a href="${unsubscribe}" style="color:${BRAND.primary};text-decoration:none;">Unsubscribe</a>
                  &nbsp;·&nbsp;
                  Sent with care from ${escapeHtml(company)}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextLayout(body: TemplateBody, vars: TemplateVars): string {
  const signature = buildSignature(vars.founder);
  const ctaLine = body.cta ? `\n${body.cta.label}: ${body.cta.href}\n` : '';
  const unsubscribe = vars.unsubscribeUrl ?? `${env.NEXT_PUBLIC_SITE_URL}/unsubscribe`;
  return [
    body.heading ?? '',
    '',
    body.bodyText,
    ctaLine,
    signature.text,
    '',
    `Unsubscribe: ${unsubscribe}`,
  ]
    .filter((s) => s !== undefined)
    .join('\n');
}

export function renderTemplate(body: TemplateBody, vars: TemplateVars): RenderedEmail {
  return {
    subject: body.subject,
    html: renderBaseLayout(body, vars),
    text: renderTextLayout(body, vars),
  };
}

export function personalize(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName ?? '')
    .replace(/\{\{lastName\}\}/g, vars.lastName ?? '')
    .replace(/\{\{companyName\}\}/g, vars.companyName ?? vars.founder.companyName ?? 'OotaOS')
    .replace(/\{\{founderName\}\}/g, vars.founder.displayName ?? 'The OotaOS founding team');
}
