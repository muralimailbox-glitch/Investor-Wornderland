import { describe, expect, it } from 'vitest';

import { signInvestorLink, verifyInvestorLink } from '@/lib/auth/investor-link';
import { env } from '@/lib/env';

describe('investor magic link URL', () => {
  it('the embed-safe site base comes from validated env (no silent fallback)', () => {
    // env.NEXT_PUBLIC_SITE_URL is required by the schema; if it ever became
    // optional and started defaulting, magic links would point to the wrong
    // host. This contract test locks the schema requirement.
    expect(env.NEXT_PUBLIC_SITE_URL).toMatch(/^https?:\/\//);
    expect(env.NEXT_PUBLIC_SITE_URL).not.toContain('placeholder');
  });

  it('round-trips a signed token to a valid session', () => {
    const { token } = signInvestorLink({
      investorId: 'inv-1',
      workspaceId: 'ws-1',
      firmId: null,
      firstName: 'Murali',
      lastName: null,
      firmName: null,
    });
    const session = verifyInvestorLink(token);
    expect(session?.investorId).toBe('inv-1');
    expect(session?.firstName).toBe('Murali');
  });

  it('rejects a tampered token', () => {
    const { token } = signInvestorLink({
      investorId: 'inv-1',
      workspaceId: 'ws-1',
      firmId: null,
      firstName: 'M',
      lastName: null,
      firmName: null,
    });
    const [body] = token.split('.');
    const tampered = `${body}.AAAAAAAA`;
    expect(verifyInvestorLink(tampered)).toBeNull();
  });
});
