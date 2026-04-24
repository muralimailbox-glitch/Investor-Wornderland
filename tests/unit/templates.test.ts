import { describe, expect, it } from 'vitest';

import type { FounderSignatureInput } from '@/lib/mail/signature';
import { renderByKey, TEMPLATE_KEYS, templateMeta, type TemplateKey } from '@/lib/mail/templates';

const FOUNDER: FounderSignatureInput = {
  displayName: 'Priya Raman',
  email: 'priya@ootaos.com',
  publicEmail: 'hello@ootaos.com',
  whatsappE164: '+61412766366',
  companyName: 'OotaOS',
  companyWebsite: 'https://ootaos.com',
  signatureMarkdown: null,
};

function baseVars(extras?: Record<string, string>) {
  return {
    firstName: 'Alex',
    lastName: 'Chen',
    founder: FOUNDER,
    companyName: 'OotaOS',
    ...(extras ? { extras } : {}),
  };
}

describe('email templates', () => {
  it('exports every declared key', () => {
    expect(TEMPLATE_KEYS.length).toBeGreaterThan(0);
    for (const k of TEMPLATE_KEYS) {
      expect(templateMeta(k).label.length).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATE_KEYS.filter((k) => k !== 'custom'))(
    'renders %s with substituted first name, no dangling {{ }} tokens, and plain-text fallback',
    (key: TemplateKey) => {
      const out = renderByKey(key, baseVars());
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.html.length).toBeGreaterThan(100);
      expect(out.text.length).toBeGreaterThan(20);
      expect(out.html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
      expect(out.text).not.toMatch(/\{\{\s*\w+\s*\}\}/);
      expect(out.text).toMatch(/Alex/);
      expect(out.html).toContain('OotaOS');
    },
  );

  it('renders custom template using extras.subject/body', () => {
    const out = renderByKey(
      'custom',
      baseVars({ subject: 'Hello {{firstName}}', body: 'Hi {{firstName}}.' }),
    );
    expect(out.subject).toBe('Hello Alex');
    expect(out.text).toContain('Hi Alex.');
  });

  it('includes WhatsApp link in signature block', () => {
    const out = renderByKey('outreach', baseVars());
    expect(out.html).toContain('wa.me/61412766366');
  });

  it('includes unsubscribe link in footer', () => {
    const out = renderByKey('outreach', baseVars());
    expect(out.html).toMatch(/Unsubscribe/i);
  });
});
