/**
 * Single source of truth for the OotaOS email brand. Both email shells
 * (`branded-email.ts` for transactional and `templates/base.ts` for
 * templated outreach) import from here so a palette tweak ripples to
 * every outbound email.
 *
 * Hex codes mirror the landing page's canonical sweep
 *   tailwind orange-500 → rose-500 → fuchsia-600
 * which is the same gradient used on the public meeting-calendar's
 * selected-slot pill and the identity-pill avatar — the cues investors
 * already associate with OotaOS.
 */
import { env } from '@/lib/env';

export const OOTAOS_BRAND = {
  /** Primary accent — left end of the brand gradient. */
  accentFrom: '#F97316', // tailwind orange-500
  /** Mid-stop accent. */
  accentVia: '#E11D48', // tailwind rose-600
  /** Right end of the brand gradient. */
  accentTo: '#C026D3', // tailwind fuchsia-600

  /** Page background — the soft violet/orange wash from the landing page. */
  bgPage: '#FFF8F1',
  /** Card background. */
  bgCard: '#FFFFFF',
  /** Card border. */
  border: '#FFE4D1',

  ink: '#0F172A',
  inkSoft: '#475569',

  /** CSS gradient string suitable for inline `style="background:..."`. */
  gradient: 'linear-gradient(135deg, #F97316 0%, #E11D48 50%, #C026D3 100%)',
} as const;

/**
 * Filename of the canonical OotaOS logo asset (rectangular logo with
 * tagline "Powering Restaurants to Win"). Its 3:1 ratio fits the email
 * header band and the tagline reinforces product context for investors.
 */
export const LOGO_FILE = 'oota-rect-tagline.png';

/**
 * Content-ID for the inline logo attachment. The HTML shell references
 * this via `cid:ootaos-logo` instead of a remote URL so the logo renders
 * even in clients that block external images by default (Tracxn, some
 * Outlook configurations, Gmail's "ask before displaying" mode).
 */
export const LOGO_CID = 'ootaos-logo';

/** `cid:` reference suitable for the `<img src>` attribute. */
export const LOGO_SRC = `cid:${LOGO_CID}`;

/**
 * Absolute URL to the canonical OotaOS logo asset. Retained for non-email
 * surfaces (e.g. shareable previews) where a remote URL is appropriate.
 * Email rendering uses the inline CID reference above.
 */
export function logoUrl(): string {
  const siteBase = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  return `${siteBase}/brand/${LOGO_FILE}`;
}

/** Absolute URL to the public marketing site (clickable from the header). */
export function siteUrl(): string {
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
}

/**
 * The public-facing marketing website. The email header logo always points
 * here (www.ootaos.com) so investors can browse the product story; the
 * investor-relations app (siteUrl) shows up in the footer for context.
 */
export const MARKETING_SITE_URL = 'https://www.ootaos.com';
