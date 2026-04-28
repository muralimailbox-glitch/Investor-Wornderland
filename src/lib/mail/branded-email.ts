/**
 * Shared OotaOS-branded email shell. Every transactional email — OTP,
 * meeting invite, meeting cancellation, request acknowledgement,
 * cockpit notification — wraps its body in this template so investors
 * see a consistent visual identity.
 *
 * Usage:
 *
 *   const { html, text } = renderBrandedEmail({
 *     heading: "Your meeting is booked",
 *     body: "Confirmed for Wed 11 May, 4 PM IST.",
 *     ctaLabel: "Open the data room",
 *     ctaHref: "https://investors.ootaos.com/lounge",
 *     facts: [
 *       ["When", "Wed 11 May 2026 · 4:00 PM IST"],
 *       ["Where", "Google Meet (link below)"],
 *     ],
 *   });
 *
 *   await sendMail({ to: "...", subject: "...", html, text });
 */
import { logoUrl, MARKETING_SITE_URL, OOTAOS_BRAND, siteUrl } from '@/lib/mail/brand';

export type BrandedEmailInput = {
  heading: string;
  /**
   * Plain-text body. Paragraphs separated by blank lines. Used for the
   * HTML render (each paragraph is escaped + wrapped in <p>) AND for the
   * plain-text fallback. For outreach mails that have pre-rendered
   * HTML (templates with lists, links, formatting), pass `bodyHtml`
   * instead — `body` then only drives the plain-text fallback.
   */
  body: string;
  /**
   * Optional pre-rendered HTML body. When set, the HTML block is dropped
   * verbatim into the shell instead of escaping the plain `body` text.
   * Outreach templates use this so their stored HTML keeps formatting.
   */
  bodyHtml?: string;
  /** Optional list of (label, value) rows displayed as a table. */
  facts?: Array<[string, string]>;
  /** Optional list of additional CTA buttons. */
  cta?: Array<{ label: string; href: string }> | undefined;
  /** Footer subline above the main footer. Use for context/disclaimers. */
  preFooter?: string;
  /**
   * Founder signature block — rendered below the body and above the
   * pre-footer for outreach emails. HTML is taken verbatim and inserted
   * inside a <td>; text version goes into the plain-text fallback. The
   * content is built by `@/lib/mail/signature` and already escaped.
   */
  signature?: { html: string; text: string };
  /**
   * Outreach emails (CAN-SPAM compliant) need a one-click unsubscribe.
   * When provided, an "Unsubscribe" link is rendered in the footer.
   * Transactional emails (OTP, meeting confirmations, NDA codes) leave
   * this undefined and the footer hides the unsubscribe row.
   */
  unsubscribeUrl?: string;
  /**
   * Override the rendered company name — defaults to "OotaOS". Used by
   * the templated outreach path to surface the workspace's display name
   * if the founder customised it in cockpit settings.
   */
  companyName?: string;
};

const SITE = siteUrl();
const LOGO_URL = logoUrl();

// Local alias so the existing render code reads cleanly. Single source of
// truth lives in @/lib/mail/brand.
const PALETTE = {
  bgPage: OOTAOS_BRAND.bgPage,
  bgCard: OOTAOS_BRAND.bgCard,
  border: OOTAOS_BRAND.border,
  ink: OOTAOS_BRAND.ink,
  inkSoft: OOTAOS_BRAND.inkSoft,
  accentFrom: OOTAOS_BRAND.accentFrom,
  accentVia: OOTAOS_BRAND.accentVia,
  accentTo: OOTAOS_BRAND.accentTo,
  gradient: OOTAOS_BRAND.gradient,
  ctaBg: OOTAOS_BRAND.gradient,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: ${PALETTE.ink};">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');
}

export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const facts = input.facts ?? [];
  const cta = input.cta ?? [];

  const factRows = facts
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding: 6px 12px 6px 0; font-size: 12px; color: ${PALETTE.inkSoft}; text-transform: uppercase; letter-spacing: 0.08em; vertical-align: top; white-space: nowrap;">${escapeHtml(k)}</td>
        <td style="padding: 6px 0; font-size: 14px; color: ${PALETTE.ink}; vertical-align: top;">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join('');

  const ctaButtons = cta
    .map(
      (c) => `
      <a href="${escapeHtml(c.href)}"
         style="display: inline-block; margin: 6px 6px 0 0; padding: 12px 22px; background: ${PALETTE.ctaBg}; color: #ffffff !important; text-decoration: none !important; border-radius: 999px; font-size: 14px; font-weight: 600; box-shadow: 0 8px 22px -10px rgba(225, 29, 72, 0.55);">
        ${escapeHtml(c.label)}
      </a>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${PALETTE.bgPage}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${escapeHtml(input.heading)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${PALETTE.bgPage}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background: ${PALETTE.bgCard}; border: 1px solid ${PALETTE.border}; border-radius: 24px; box-shadow: 0 20px 60px -30px rgba(234, 88, 12, 0.18); overflow: hidden;">
          <tr>
            <td style="padding: 28px 32px 0 32px;">
              <!-- Image-free brand mark: Gmail/Outlook proxy + ad-blockers
                   were stripping the hot-linked PNG. CSS gradient on text
                   renders in every modern client; bgcolor fallback covers
                   the few that don't. Logo URL kept as fallback img tag
                   below so corporate clients that whitelist the domain
                   still get the full mark. -->
              <a href="${MARKETING_SITE_URL}" style="display: inline-block; text-decoration: none;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                  <tr>
                    <td bgcolor="${PALETTE.accentVia}" style="padding: 8px 14px; border-radius: 10px; background: ${PALETTE.gradient};">
                      <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 0.02em; color: #ffffff; text-decoration: none;">OotaOS</span>
                    </td>
                  </tr>
                </table>
                <img src="${LOGO_URL}" alt="" width="0" height="0" style="display: none; max-height: 0; max-width: 0; overflow: hidden;"/>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 32px 0 32px;">
              <div style="height: 4px; width: 64px; background: linear-gradient(90deg, ${PALETTE.accentFrom}, ${PALETTE.accentTo}); border-radius: 99px;"></div>
              <h1 style="margin: 16px 0 16px; font-size: 22px; line-height: 1.25; color: ${PALETTE.ink}; letter-spacing: -0.01em;">${escapeHtml(input.heading)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 8px 32px;">
              ${input.bodyHtml ?? paragraphsToHtml(input.body)}
            </td>
          </tr>
          ${
            facts.length > 0
              ? `<tr>
                  <td style="padding: 8px 32px 8px 32px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="border-top: 1px solid ${PALETTE.border}; padding-top: 12px;">
                      ${factRows}
                    </table>
                  </td>
                </tr>`
              : ''
          }
          ${ctaButtons ? `<tr><td style="padding: 8px 32px 8px 32px;">${ctaButtons}</td></tr>` : ''}
          ${
            input.signature
              ? `<tr><td style="padding: 16px 32px 0 32px;">${input.signature.html}</td></tr>`
              : ''
          }
          ${
            input.preFooter
              ? `<tr><td style="padding: 16px 32px 0 32px;"><p style="margin: 0; font-size: 12px; color: ${PALETTE.inkSoft}; line-height: 1.5;">${escapeHtml(input.preFooter)}</p></td></tr>`
              : ''
          }
          <tr>
            <td style="padding: 24px 32px 28px 32px;">
              <hr style="border: none; border-top: 1px solid ${PALETTE.border}; margin: 0 0 16px;"/>
              <p style="margin: 0 0 4px; font-size: 12px; color: ${PALETTE.inkSoft};">
                <a href="${MARKETING_SITE_URL}" style="color: ${PALETTE.inkSoft}; text-decoration: none; font-weight: 600;">${escapeHtml(input.companyName ?? 'OotaOS')}</a>
                · Sydney, Australia · Restaurant operating system
              </p>
              <p style="margin: 0; font-size: 11px; color: ${PALETTE.inkSoft};">
                <a href="${SITE}" style="color: ${PALETTE.inkSoft}; text-decoration: underline;">investors.ootaos.com</a>
                · <a href="${SITE}/privacy" style="color: ${PALETTE.inkSoft}; text-decoration: underline;">Privacy</a>
                · <a href="mailto:info@ootaos.com" style="color: ${PALETTE.inkSoft}; text-decoration: underline;">info@ootaos.com</a>${
                  input.unsubscribeUrl
                    ? `
                · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${PALETTE.inkSoft}; text-decoration: underline;">Unsubscribe</a>`
                    : ''
                }
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>`;

  // Plain-text fallback
  const textParts: string[] = [];
  textParts.push(input.heading);
  textParts.push('');
  textParts.push(input.body);
  if (facts.length > 0) {
    textParts.push('');
    for (const [k, v] of facts) textParts.push(`${k}: ${v}`);
  }
  if (cta.length > 0) {
    textParts.push('');
    for (const c of cta) textParts.push(`${c.label}: ${c.href}`);
  }
  if (input.signature?.text) {
    textParts.push('');
    textParts.push(input.signature.text);
  }
  if (input.preFooter) {
    textParts.push('');
    textParts.push(input.preFooter);
  }
  textParts.push('');
  textParts.push(`— ${input.companyName ?? 'OotaOS'} · Sydney · investors.ootaos.com`);
  if (input.unsubscribeUrl) {
    textParts.push(`Unsubscribe: ${input.unsubscribeUrl}`);
  }

  return { html, text: textParts.join('\n') };
}
