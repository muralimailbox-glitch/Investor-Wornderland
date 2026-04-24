import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('hashes and verifies a known password', async () => {
    const hash = await hashPassword('Correct-Horse-Battery-Staple-42');
    expect(hash).toMatch(/^\$argon2id\$/);
    const ok = await verifyPassword(hash, 'Correct-Horse-Battery-Staple-42');
    expect(ok).toBe(true);
  }, 30_000);

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('one-password');
    const ok = await verifyPassword(hash, 'other-password');
    expect(ok).toBe(false);
  }, 30_000);

  it('returns false for malformed hash', async () => {
    const ok = await verifyPassword('not-a-real-hash', 'whatever');
    expect(ok).toBe(false);
  });

  it('produces distinct hashes for the same password (salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  }, 30_000);
});
