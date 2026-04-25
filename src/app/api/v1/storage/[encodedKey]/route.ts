import { createHmac, timingSafeEqual } from 'node:crypto';

import { handle } from '@/lib/api/handle';
import { env } from '@/lib/env';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  const parsed = new URL(req.url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const encodedKey = segments[segments.length - 1] ?? '';
  const key = Buffer.from(encodedKey, 'base64url').toString('utf8');

  const sp = parsed.searchParams;
  const exp = sp.get('exp');
  const sig = sp.get('sig');
  const ct = sp.get('ct') ?? 'application/octet-stream';

  if (!exp || !sig) {
    return new Response('missing_token', { status: 401 });
  }

  const expMs = Number(exp);
  if (isNaN(expMs) || Date.now() > expMs) {
    return new Response('token_expired', { status: 401 });
  }

  const expected = createHmac('sha256', env.AUTH_SECRET)
    .update(`${key}:${exp}:${ct}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return new Response('invalid_token', { status: 401 });
  }

  const bytes = await getStorage().get(key);
  const buffer = Buffer.from(bytes);
  const filename = key.split('/').pop() ?? 'file';

  return new Response(buffer, {
    headers: {
      'Content-Type': ct,
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
