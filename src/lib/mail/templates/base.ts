/**
 * Outreach-template renderer. Historically this file owned its own HTML
 * shell duplicating renderBrandedEmail. The two have been collapsed: this
 * module now thin-wraps `renderBrandedEmail` so every outbound email —
 * transactional (OTP, meeting confirmations, NDA codes) and outreach
 * (investor templates, batch dispatch) — flows through a single visual
 * shell with one logo, one footer, one set of links.
 *
 * What outreach mails carry that transactional mails don't:
 *   - A founder signature block (built by buildSignature)
 *   - A CAN-SPAM "Unsubscribe" link in the footer
 *   - A configurable companyName (when the founder customised it)
 *
 * The renderer accepts the same TemplateBody/TemplateVars contract its
 * callers already use, so draft/send, draft/test, and batch dispatch
 * keep working unchanged.
 */
import { env } from '@/lib/env';
import { renderBrandedEmail } from '@/lib/mail/branded-email';
import { buildSignature, type FounderSignatureInput } from '@/lib/mail/signature';

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
  /** HTML fragment — preserved verbatim inside the shell body well. */
  bodyHtml: string;
  /** Plain-text equivalent. */
  bodyText: string;
  /** Optional CTA rendered as a prominent button. */
  cta?: { label: string; href: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderTemplate(body: TemplateBody, vars: TemplateVars): RenderedEmail {
  const company = vars.companyName ?? vars.founder.companyName ?? 'OotaOS';
  const unsubscribe = vars.unsubscribeUrl ?? `${env.NEXT_PUBLIC_SITE_URL}/unsubscribe`;
  const signature = buildSignature(vars.founder);

  // bodyHtml carries the outreach template's pre-rendered HTML so its
  // links/lists/line-breaks survive intact. body (plain text) drives the
  // text-only fallback. The signature block is rendered separately by
  // the shell so it sits below the body and above the pre-footer.
  const rendered = renderBrandedEmail({
    heading: body.heading ?? body.subject,
    body: body.bodyText,
    bodyHtml: body.bodyHtml,
    cta: body.cta ? [body.cta] : [],
    signature,
    unsubscribeUrl: unsubscribe,
    companyName: company,
  });

  return {
    subject: body.subject,
    html: rendered.html,
    text: rendered.text,
  };
}

export function personalize(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName ?? '')
    .replace(/\{\{lastName\}\}/g, vars.lastName ?? '')
    .replace(/\{\{companyName\}\}/g, vars.companyName ?? vars.founder.companyName ?? 'OotaOS')
    .replace(/\{\{founderName\}\}/g, vars.founder.displayName ?? 'The OotaOS founding team');
}
