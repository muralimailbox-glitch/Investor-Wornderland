import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { Lucia } from 'lucia';

import { db } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import { env } from '@/lib/env';

const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users);

type UserRole = 'founder' | 'team' | 'advisor';

export const lucia = new Lucia(adapter, {
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
