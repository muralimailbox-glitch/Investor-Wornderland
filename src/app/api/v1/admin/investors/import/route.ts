import { z } from 'zod';

import { BadRequestError, handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { importInvestorsCsv } from '@/lib/services/investors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ContentType = z.string().max(120);
const JsonBody = z.object({ csv: z.string().min(1).max(1_000_000) });

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:import', perMinute: 6 });
  const { user } = await requireAuth({ role: 'founder' });

  const contentType = ContentType.parse(req.headers.get('content-type') ?? '');
  let csv = '';
  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    csv = await req.text();
    if (csv.length === 0 || csv.length > 1_000_000)
      throw new BadRequestError('csv_size_out_of_range');
  } else if (contentType.includes('application/json')) {
    const body = JsonBody.parse(await req.json());
    csv = body.csv;
  } else {
    throw new BadRequestError('unsupported_content_type');
  }

  const result = await importInvestorsCsv(user.workspaceId, user.id, csv);
  return Response.json(result);
});
