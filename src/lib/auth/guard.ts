import { cookies } from 'next/headers';

import { lucia } from './lucia';

export type Role = 'founder' | 'team' | 'advisor';

export class AuthError extends Error {
  constructor(public code: 'no-session' | 'invalid-session' | 'forbidden') {
    super(code);
    this.name = 'AuthError';
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (!sessionId) return null;
  const result = await lucia.validateSession(sessionId);
  if (!result.session) return null;
  if (result.session.fresh) {
    const cookie = lucia.createSessionCookie(result.session.id);
    cookieStore.set(cookie.name, cookie.value, cookie.attributes);
  }
  return result;
}

export async function requireAuth(opts: { role?: Role } = {}) {
  const session = await getSession();
  if (!session) throw new AuthError('no-session');
  if (opts.role && session.user.role !== opts.role) {
    throw new AuthError('forbidden');
  }
  return session;
}

export async function clearSession(sessionId?: string) {
  const cookieStore = await cookies();
  if (sessionId) await lucia.invalidateSession(sessionId);
  const blank = lucia.createBlankSessionCookie();
  cookieStore.set(blank.name, blank.value, blank.attributes);
}
