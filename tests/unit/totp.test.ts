import { decodeBase32 } from '@oslojs/encoding';
import { generateTOTP } from '@oslojs/otp';
import { describe, expect, it } from 'vitest';

import { newTotpSecret, totpUri, verifyTotpCode } from '@/lib/auth/totp';

describe('TOTP', () => {
  it('generates a base32 secret that decodes to 20 bytes', () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[a-z2-7]+$/);
    const bytes = decodeBase32(secret.toUpperCase());
    expect(bytes.length).toBe(20);
  });

  it('produces a different secret every call', () => {
    const a = newTotpSecret();
    const b = newTotpSecret();
    expect(a).not.toBe(b);
  });

  it('totpUri includes issuer and account', () => {
    const secret = newTotpSecret();
    const uri = totpUri(secret, 'founder@ootaos.com');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('OotaOS');
    expect(uri).toContain('founder%40ootaos.com');
  });

  it('verifies a freshly-generated code', () => {
    const secret = newTotpSecret();
    const bytes = decodeBase32(secret.toUpperCase());
    const code = generateTOTP(bytes, 30, 6);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects a non-digit string', () => {
    const secret = newTotpSecret();
    expect(verifyTotpCode(secret, 'abcdef')).toBe(false);
  });

  it('rejects a wrong-length code', () => {
    const secret = newTotpSecret();
    expect(verifyTotpCode(secret, '12345')).toBe(false);
    expect(verifyTotpCode(secret, '1234567')).toBe(false);
  });

  it('rejects a code that is digits but wrong', () => {
    const secret = newTotpSecret();
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('returns false on malformed secret without throwing', () => {
    expect(verifyTotpCode('!!not-base32!!', '123456')).toBe(false);
  });
});
