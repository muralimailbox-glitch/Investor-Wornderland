import { describe, expect, it } from 'vitest';

import { PREVIEW_TTL_MINUTES, signPreviewToken, verifyPreviewToken } from '@/lib/auth/preview';

describe('preview token', () => {
  it('round-trips a founder-only session', () => {
    const { cookieValue } = signPreviewToken({
      founderId: 'f1',
      workspaceId: 'w1',
    });
    const decoded = verifyPreviewToken(cookieValue);
    expect(decoded?.founderId).toBe('f1');
    expect(decoded?.workspaceId).toBe('w1');
    expect(decoded?.investorId).toBeNull();
  });

  it('round-trips a per-investor session', () => {
    const { cookieValue } = signPreviewToken({
      founderId: 'f2',
      workspaceId: 'w2',
      investorId: 'inv-9',
    });
    const decoded = verifyPreviewToken(cookieValue);
    expect(decoded?.investorId).toBe('inv-9');
  });

  it('rejects a tampered body', () => {
    const { cookieValue } = signPreviewToken({ founderId: 'f1', workspaceId: 'w1' });
    const [, mac] = cookieValue.split('.');
    const tampered = `eyJmb3VuZGVySWQiOiJoYWNrZXIifQ.${mac}`;
    expect(verifyPreviewToken(tampered)).toBeNull();
  });

  it('rejects a tampered mac', () => {
    const { cookieValue } = signPreviewToken({ founderId: 'f1', workspaceId: 'w1' });
    const [body] = cookieValue.split('.');
    expect(verifyPreviewToken(`${body}.AAAA`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyPreviewToken('')).toBeNull();
    expect(verifyPreviewToken('no-dot-in-this')).toBeNull();
    expect(verifyPreviewToken(null)).toBeNull();
    expect(verifyPreviewToken(undefined)).toBeNull();
  });

  it('exposes a sensible TTL', () => {
    expect(PREVIEW_TTL_MINUTES).toBeGreaterThan(0);
    expect(PREVIEW_TTL_MINUTES).toBeLessThanOrEqual(60);
    const { maxAgeSeconds, expiresAt } = signPreviewToken({
      founderId: 'f',
      workspaceId: 'w',
    });
    expect(maxAgeSeconds).toBeGreaterThan(0);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
