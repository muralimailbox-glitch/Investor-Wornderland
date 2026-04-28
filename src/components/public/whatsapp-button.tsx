import { MessageCircle } from 'lucide-react';

const FOUNDER_WA_E164 = '61412766366'; // Sydney, Australia

type Props = {
  /** Optional pre-filled message (URL-encoded by us). */
  message?: string;
  /** "pill" = full button, "compact" = icon-only round badge */
  variant?: 'pill' | 'compact';
  /** Forward classes for layout-side overrides */
  className?: string;
};

/**
 * Direct WhatsApp connect button — opens wa.me with the founder's number
 * pre-filled. Works on every device (web → wa.me/web, mobile → wa.me native).
 */
export function WhatsappButton({ message, variant = 'pill', className = '' }: Props) {
  const text = message
    ? `?text=${encodeURIComponent(message)}`
    : `?text=${encodeURIComponent("Hi Krish — I'd like to chat about OotaOS.")}`;
  const href = `https://wa.me/${FOUNDER_WA_E164}${text}`;

  if (variant === 'compact') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        aria-label="Connect on WhatsApp"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md transition hover:-translate-y-px ${className}`}
      >
        <MessageCircle className="h-4 w-4" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-white shadow-md transition hover:-translate-y-px ${className}`}
    >
      <MessageCircle className="h-4 w-4" />
      WhatsApp the founder
    </a>
  );
}
