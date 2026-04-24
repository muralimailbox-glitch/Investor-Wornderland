import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { Lucia } from 'lucia';

import { db } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import { env } from '@/lib/env';

type UserRole = 'founder' | 'team' | 'advisor';

function makeLucia() {
  const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);
  return new Lucia(adapter, {
    sessionCookie: {
      name: env.SESSION_COOKIE_NAME,
      expires: false,
      attributes: {
        sameSite: 'strict',
        secure: env.NODE_ENV === 'production',
      },
    },
    getUserAttributes: (attrs) => ({
      email: attrs.email,
      role: attrs.role,
      workspaceId: attrs.workspaceId,
    }),
  });
}

type LuciaInstance = ReturnType<typeof makeLucia>;
let luciaInstance: LuciaInstance | null = null;

function getLucia(): LuciaInstance {
  if (!luciaInstance) luciaInstance = makeLucia();
  return luciaInstance;
}

export const lucia = new Proxy({} as LuciaInstance, {
  get(_target, prop, receiver) {
    const instance = getLucia();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      role: UserRole;
      workspaceId: string;
    };
  }
}
