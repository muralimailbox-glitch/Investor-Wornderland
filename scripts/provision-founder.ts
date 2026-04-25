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

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL;
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD;
const FOUNDER_FIRST_NAME = process.env.FOUNDER_FIRST_NAME ?? 'Murali';

if (!FOUNDER_EMAIL || !FOUNDER_PASSWORD) {
  console.error(
    'FOUNDER_EMAIL and FOUNDER_PASSWORD are required. Example:\n' +
      "  FOUNDER_EMAIL=me@x.com FOUNDER_PASSWORD='S3cret!' pnpm tsx scripts/provision-founder.ts",
  );
  process.exit(1);
}

async function main() {
  const { db } = await import('@/lib/db/client');
  const { workspaces } = await import('@/lib/db/schema');
  const { totpUri } = await import('@/lib/auth/totp');
  const { provisionFounder } = await import('@/lib/auth/founder-provision');
  const { decodeBase32 } = await import('@oslojs/encoding');
  const { generateTOTP } = await import('@oslojs/otp');

  const [workspace] = await db.select().from(workspaces).limit(1);
  if (!workspace) {
    console.error('no workspace found. run `pnpm db:seed` first.');
    process.exit(1);
  }

  const result = await provisionFounder(db, {
    workspaceId: workspace.id,
    email: FOUNDER_EMAIL!,
    password: FOUNDER_PASSWORD!,
    firstName: FOUNDER_FIRST_NAME,
  });

  console.log(`${result.rotated ? 'rotated existing' : 'created'} founder user ${result.userId}`);

  const uri = totpUri(result.totpSecret, FOUNDER_EMAIL!);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / 30);
  const codeBytes = decodeBase32(result.totpSecret.toUpperCase());
  const currentCode = generateTOTP(codeBytes, 30, 6);

  console.log('');
  console.log('──────────────────────────────────────────────────');
  console.log(`email:       ${FOUNDER_EMAIL}`);
  console.log(`password:    ${FOUNDER_PASSWORD}`);
  console.log(`totp secret: ${result.totpSecret.toUpperCase()}`);
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
