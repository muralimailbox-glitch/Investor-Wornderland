import { decodeBase32 } from '@oslojs/encoding';
import { generateTOTP } from '@oslojs/otp';

const secret = process.argv[2];
if (!secret) {
  console.error('usage: pnpm tsx scripts/current-totp.ts <BASE32_SECRET>');
  process.exit(1);
}
const code = generateTOTP(decodeBase32(secret.toUpperCase()), 30, 6);
process.stdout.write(code);
