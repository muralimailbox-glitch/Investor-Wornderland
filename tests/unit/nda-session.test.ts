import { describe, expect, it } from 'vitest';

import {
  issueNdaSession,
  issueSigningToken,
  readNdaSession,
  readSigningToken,
} from '@/lib/auth/nda-session';

describe('NDA session cookies', () => {
  it('issues and reads back a session', () => {
    const issued = issueNdaSession({
      leadId: 'lead-1',
      ndaId: 'nda-1',
      email: 'INVESTOR@Example.COM',
    });
    const read = readNdaSession(issued.cookieValue);
    expect(read).not.toBeNull();
    expect(read!.leadId).toBe('lead-1');
    expect(read!.ndaId).toBe('nda-1');
    expect(read!.email).toBe('investor@example.com');
    expect(read!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('produces a maxAgeSeconds that matches the 72h TTL', () => {
    const issued = issueNdaSession({ leadId: 'l', ndaId: 'n', email: 'a@b.co' });
    expect(issued.maxAgeSeconds).toBe(72 * 60 * 60);
  });

  it('rejects undefined/empty cookie', () => {
    expect(readNdaSession(undefined)).toBeNull();
    expect(readNdaSession(null)).toBeNull();
    expect(readNdaSession('')).toBeNull();
  });

  it('rejects a tampered body', () => {
    const issued = issueNdaSession({ leadId: 'l', ndaId: 'n', email: 'a@b.co' });
    const [body, mac] = issued.cookieValue.split('.');
    const tampered = `${body}X.${mac}`;
    expect(readNdaSession(tampered)).toBeNull();
  });

  it('rejects a token missing the HMAC section', () => {
    expect(readNdaSession('only-one-part')).toBeNull();
  });

  it('rejects an expired session', () => {
    const issued = issueNdaSession({ leadId: 'l', ndaId: 'n', email: 'a@b.co' });
    const [body, mac] = issued.cookieValue.split('.');
    const decoded = JSON.parse(
      Buffer.from(body!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    decoded.expiresAt = Date.now() - 1;
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8')
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(readNdaSession(`${forged}.${mac}`)).toBeNull();
  });
});

describe('NDA signing tokens', () => {
  it('round-trips a signing token', () => {
    const { token, expiresAt } = issueSigningToken({ email: 'x@y.co', leadId: 'lead-42' });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const read = readSigningToken(token);
    expect(read).not.toBeNull();
    expect(read!.email).toBe('x@y.co');
    expect(read!.leadId).toBe('lead-42');
    expect(read!.nonce).toBeTruthy();
  });

  it('rejects a completely invalid token', () => {
    expect(readSigningToken('garbage.garbage')).toBeNull();
  });

  it('rejects an expired signing token', () => {
    const { token } = issueSigningToken({ email: 'x@y.co', leadId: 'l' });
    const [body, mac] = token.split('.');
    const decoded = JSON.parse(
      Buffer.from(body!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    decoded.expiresAt = Date.now() - 1000;
    const forged = Buffer.from(JSON.stringify(decoded), 'utf8')
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(readSigningToken(`${forged}.${mac}`)).toBeNull();
  });
});
