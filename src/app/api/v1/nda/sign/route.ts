import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { NDA_SESSION_COOKIE } from '@/lib/auth/nda-session';
import { rateLimit } from '@/lib/security/rate-limit';
import { signNda } from '@/lib/services/nda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  token: z.string().min(16),
  name: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  firm: z.string().min(1).max(160),
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'nda:sign', perMinute: 6 });
  const body = Body.parse(await req.json());
  const result = await signNda({
    token: body.token,
    name: body.name,
    title: body.title,
    firm: body.firm,
    signerIp: clientIp(req),
    signerUserAgent: req.headers.get('user-agent')?.slice(0, 300) ?? 'unknown',
  });

  const res = Response.json({
    ndaId: result.ndaId,
    leadId: result.leadId,
    downloadUrl: result.downloadUrl,
  });
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  res.headers.append(
    'Set-Cookie',
    `${NDA_SESSION_COOKIE}=${result.sessionCookieValue}; Path=/; HttpOnly; SameSite=Lax; ${secure}Max-Age=${result.sessionMaxAgeSeconds}`,
  );
  return res;
});
