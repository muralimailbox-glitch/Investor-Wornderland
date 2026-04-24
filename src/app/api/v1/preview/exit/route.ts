import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { PREVIEW_COOKIE } from '@/lib/auth/preview';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({}).optional();

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'preview:exit', perMinute: 30 });
  const raw = await req.json().catch(() => ({}));
  Body.parse(raw);
  const res = Response.json({ ok: true });
  res.headers.append(
    'Set-Cookie',
    [
      `${PREVIEW_COOKIE}=`,
      `Path=/`,
      `HttpOnly`,
      env.NODE_ENV === 'production' ? 'Secure' : '',
      `SameSite=Lax`,
      `Max-Age=0`,
    ]
      .filter(Boolean)
      .join('; '),
  );
  return res;
});
