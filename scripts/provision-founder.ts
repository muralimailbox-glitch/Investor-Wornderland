/**
 * Provision / re-provision the founder user with a real argon2 hash and a
 * real TOTP secret so the cockpit login actually works. Idempotent: if the
 * user exists its credentials are rotated; otherwise it is created.
 *
 * Usage:
 *   FOUNDER_EMAIL=me@x.com FOUNDER_PASSWORD='S3cret!' pnpm tsx scripts/provision-founder.ts
 *
 * Prints:
 *   • the TOTP secret (copy-paste into Google Authenticator manually)
 *   • an otpauth:// URI (scan as QR)
 *   • the current 6-digit code (expires in ~30s — use it right away)
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? 'founder@ootaos.com';
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD ?? 'ChangeMe!DevOnly';

async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('@/lib/db/client');
  const { users, workspaces } = await import('@/lib/db/schema');
  const { hashPassword } = await import('@/lib/auth/password');
  const { newTotpSecret, totpUri } = await import('@/lib/auth/totp');
  const { decodeBase32 } = await import('@oslojs/encoding');
  const { generateTOTP } = await import('@oslojs/otp');

  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) {
    console.error('no workspace found. run `pnpm db:seed` first.');
    process.exit(1);
  }

  const secret = newTotpSecret();
  const passwordHash = await hashPassword(FOUNDER_PASSWORD);

  const [existing] = await db.select().from(users).where(eq(users.email, FOUNDER_EMAIL)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, totpSecret: secret })
      .where(eq(users.id, existing.id));
    console.log(`rotated founder user ${existing.id}`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        workspaceId: workspace.id,
        email: FOUNDER_EMAIL,
        passwordHash,
        totpSecret: secret,
        role: 'founder',
      })
      .returning();
    console.log(`created founder user ${created?.id}`);
  }

  const uri = totpUri(secret, FOUNDER_EMAIL);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / 30);
  const codeBytes = decodeBase32(secret.toUpperCase());
  const currentCode = generateTOTP(codeBytes, 30, 6);

  console.log('');
  console.log('──────────────────────────────────────────────────');
  console.log(`email:       ${FOUNDER_EMAIL}`);
  console.log(`password:    ${FOUNDER_PASSWORD}`);
  console.log(`totp secret: ${secret.toUpperCase()}`);
  console.log(`otpauth:     ${uri}`);
  console.log(`CURRENT 6-DIGIT CODE: ${currentCode}   (counter ${counter})`);
  console.log('──────────────────────────────────────────────────');
  console.log(
    'Use the current code within ~30s. For future logins, scan the otpauth URI as a QR in Google/Microsoft Authenticator or paste the secret manually.',
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
