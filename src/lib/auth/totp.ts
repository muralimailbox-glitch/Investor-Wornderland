import { decodeBase32, encodeBase32 } from '@oslojs/encoding';
import { createTOTPKeyURI, verifyTOTP } from '@oslojs/otp';

const TOTP_INTERVAL_SECONDS = 30;
const TOTP_DIGITS = 6;
const ISSUER = 'OotaOS';

export function newTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32(bytes).toLowerCase();
}

export function totpUri(secret: string, email: string): string {
  return createTOTPKeyURI(
    ISSUER,
    email,
    decodeBase32(secret.toUpperCase()),
    TOTP_INTERVAL_SECONDS,
    TOTP_DIGITS,
  );
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return verifyTOTP(decodeBase32(secret.toUpperCase()), TOTP_INTERVAL_SECONDS, TOTP_DIGITS, code);
  } catch {
    return false;
  }
}
