import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { hashPassword } from '@/lib/auth/password';
import { newTotpSecret } from '@/lib/auth/totp';
import * as schema from '@/lib/db/schema';

export type ProvisionFounderInput = {
  workspaceId: string;
  email: string;
  password: string;
  firstName?: string;
};

export type ProvisionFounderResult = {
  userId: string;
  rotated: boolean;
  totpSecret: string;
};

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Idempotent founder provisioning. Used by both `pnpm db:seed` and
 * `scripts/provision-founder.ts`. Both share the same drizzle schema.
 */
export async function provisionFounder(
  db: DrizzleDb,
  input: ProvisionFounderInput,
): Promise<ProvisionFounderResult> {
  const passwordHash = await hashPassword(input.password);
  const totpSecret = newTotpSecret();
  const displayName = input.firstName ?? null;

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  const found = existing[0];
  if (found) {
    await db
      .update(schema.users)
      .set({
        passwordHash,
        totpSecret,
        ...(displayName ? { displayName } : {}),
        role: 'founder',
        workspaceId: input.workspaceId,
      })
      .where(eq(schema.users.id, found.id));
    return { userId: found.id, rotated: true, totpSecret };
  }

  const created = await db
    .insert(schema.users)
    .values({
      workspaceId: input.workspaceId,
      email: input.email,
      passwordHash,
      totpSecret,
      role: 'founder',
      ...(displayName ? { displayName } : {}),
    })
    .returning();

  const row = created[0];
  if (!row) throw new Error('founder_insert_failed');
  return { userId: row.id, rotated: false, totpSecret };
}
