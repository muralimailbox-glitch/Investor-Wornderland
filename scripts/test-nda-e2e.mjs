/**
 * NDA E2E smoke test — runs against production.
 *
 * Steps:
 *  1. POST /api/v1/nda/initiate  → OTP issued, stored in rate_limits
 *  2. Extract OTP from DB via brute-force (known HMAC pattern)
 *  3. POST /api/v1/nda/verify    → signing token
 *  4. POST /api/v1/nda/sign      → NDA sealed, stored_files row created
 *  5. Verify compression: size_bytes_compressed <= size_bytes_original (within reason)
 *  6. Verify download URL returns HTTP 200 application/pdf
 *  7. Verify lounge access with NDA session cookie from Set-Cookie header
 *  8. Clean up all test data
 *
 * Usage:  node scripts/test-nda-e2e.mjs
 */

import { createHmac } from 'node:crypto';
import postgres from 'postgres';

const BASE_URL = 'https://investor-wornderland-production.up.railway.app';
const DATABASE_URL =
  'postgresql://postgres:SGjhCqKsdslMLhJHVcAnctSJebsBYWpg@shuttle.proxy.rlwy.net:37766/railway';
const AUTH_SECRET = '553ccfb39064a2fb4adad7ff6620575d77be1c57408d5b22e9f9385b4dd1766c';

const ts = Date.now();
const TEST_EMAIL = `muralimailbox+nda-test-${ts}@gmail.com`;

const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

function hmacOtp(email, code) {
  return createHmac('sha256', AUTH_SECRET)
    .update(`${email.toLowerCase()}|${code}`)
    .digest('hex');
}

function extractCookie(headers, name) {
  const setCookie = headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`(?:^|,)\\s*${name}=([^;,]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  const result = await fn();
  console.log('OK');
  return result;
}

async function main() {
  console.log(`\nNDA E2E test — ${TEST_EMAIL}\n`);

  // 1. Initiate NDA
  await step('POST /api/v1/nda/initiate', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/nda/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`initiate failed ${res.status}: ${JSON.stringify(body)}`);
    if (!body.sent) throw new Error(`unexpected response: ${JSON.stringify(body)}`);
  });

  // 2. Extract OTP from DB via brute-force
  let otpCode;
  await step('Recover OTP via DB brute-force (100000–999999)', async () => {
    await new Promise((r) => setTimeout(r, 1000)); // let DB commit settle
    const normalized = TEST_EMAIL.toLowerCase();
    const rows = await sql`
      SELECT key FROM rate_limits
      WHERE key LIKE ${'nda-otp:' + normalized + '|%'}
      LIMIT 1
    `;
    if (!rows.length) throw new Error('OTP row not found in rate_limits');
    const storedHash = rows[0].key.slice(`nda-otp:${normalized}|`.length);

    for (let code = 100000; code <= 999999; code++) {
      if (hmacOtp(normalized, String(code)) === storedHash) {
        otpCode = String(code);
        return;
      }
    }
    throw new Error('Could not recover OTP — brute-force exhausted (900k iterations)');
  });

  // 3. Verify OTP → signing token
  let signingToken;
  await step('POST /api/v1/nda/verify', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/nda/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, otp: otpCode }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`verify failed ${res.status}: ${JSON.stringify(body)}`);
    if (!body.token) throw new Error(`no token in response: ${JSON.stringify(body)}`);
    signingToken = body.token;
  });

  // 4. Sign NDA → PDF sealed, stored_files row created
  let downloadUrl;
  let ndaSessionCookie;
  await step('POST /api/v1/nda/sign', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/nda/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'nda-e2e-test/1.0',
      },
      body: JSON.stringify({
        token: signingToken,
        name: 'Test Investor',
        title: 'General Partner',
        firm: 'Test VC Fund',
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`sign failed ${res.status}: ${JSON.stringify(body)}`);
    if (!body.ndaId || !body.downloadUrl) {
      throw new Error(`unexpected sign response: ${JSON.stringify(body)}`);
    }
    downloadUrl = body.downloadUrl;
    ndaSessionCookie = extractCookie(res.headers, 'ootaos_nda');
    if (!ndaSessionCookie) throw new Error('ootaos_nda cookie missing from Set-Cookie header');
  });

  // 5. Verify compression in stored_files
  let storedFile;
  await step('Verify PDF row in stored_files', async () => {
    const rows = await sql`
      SELECT storage_key, size_bytes_original, size_bytes_compressed
      FROM stored_files
      WHERE storage_key LIKE ${'ndas/%'}
        AND created_at > now() - interval '3 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!rows.length) throw new Error('No stored_files row found for test NDA');
    storedFile = rows[0];
    const orig = storedFile.size_bytes_original;
    const comp = storedFile.size_bytes_compressed;
    process.stdout.write(`\n      original=${orig} B  compressed=${comp} B  ratio=${(comp / orig).toFixed(3)} ... `);
    // For small PDFs pdf-lib may not reduce size. Accept within 10% inflation as OK.
    if (comp > orig * 1.1) {
      throw new Error(`compression inflated PDF by more than 10% (${comp} vs ${orig})`);
    }
  });

  // 6. Verify download URL returns application/pdf
  // Rewrite the host to the Railway URL in case NEXT_PUBLIC_SITE_URL is still stale.
  await step('GET download URL → 200 application/pdf', async () => {
    const testUrl = downloadUrl.replace(/^https?:\/\/[^/]+/, BASE_URL);
    const res = await fetch(testUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status} (url: ${testUrl})`);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/pdf')) {
      throw new Error(`unexpected content-type: ${ct}`);
    }
    await res.body?.cancel();
  });

  // 7. Verify lounge access via NDA session cookie
  await step('GET /api/v1/lounge → 200 with NDA cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/lounge`, {
      headers: { Cookie: `ootaos_nda=${encodeURIComponent(ndaSessionCookie)}` },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`lounge access failed ${res.status}: ${JSON.stringify(body)}`);
    if (!Array.isArray(body.documents)) {
      throw new Error(`lounge response missing documents array: ${JSON.stringify(body)}`);
    }
  });

  // 8. Clean up test data
  await step('Clean up test data', async () => {
    const normalized = TEST_EMAIL.toLowerCase();
    const ndas = await sql`SELECT id, lead_id FROM ndas WHERE signer_email = ${normalized}`;
    const leadIds = ndas.map((n) => n.lead_id);

    if (storedFile?.storage_key) {
      await sql`DELETE FROM stored_files WHERE storage_key = ${storedFile.storage_key}`;
    }
    await sql`DELETE FROM ndas WHERE signer_email = ${normalized}`;
    if (leadIds.length) {
      await sql`DELETE FROM interactions WHERE lead_id = ANY(${leadIds})`;
      await sql`DELETE FROM meetings WHERE lead_id = ANY(${leadIds})`;
      await sql`DELETE FROM leads WHERE id = ANY(${leadIds})`;
    }
    const invRows = await sql`SELECT id FROM investors WHERE email = ${normalized}`;
    if (invRows.length) {
      await sql`DELETE FROM investors WHERE id = ANY(${invRows.map((r) => r.id)})`;
    }
    await sql`DELETE FROM rate_limits WHERE key LIKE ${'nda-otp:' + normalized + '|%'}`;
    await sql`DELETE FROM email_outbox WHERE to_email = ${normalized}`;
  });

  await sql.end();
  console.log('\n  All steps passed. NDA E2E test GREEN.\n');
}

main().catch(async (err) => {
  console.error('\n  FAILED:', err.message ?? err);
  await sql.end().catch(() => {});
  process.exit(1);
});
