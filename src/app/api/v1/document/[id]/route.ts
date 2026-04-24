import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { rateLimit } from '@/lib/security/rate-limit';
import { getDocumentForSession } from '@/lib/services/lounge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdParam = z.string().uuid();

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'document:get', perMinute: 60 });
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const id = IdParam.parse(segments[segments.length - 1]);

  const { bytes, filename, mimeType } = await getDocumentForSession(id);
  const body = new Uint8Array(bytes);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
