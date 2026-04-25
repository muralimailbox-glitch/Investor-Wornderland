import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { createInvestor, listInvestors, type InvestorListQuery } from '@/lib/services/investors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  search: z.string().max(120).optional(),
  stage: z
    .enum([
      'prospect',
      'contacted',
      'engaged',
      'nda_pending',
      'nda_signed',
      'meeting_scheduled',
      'diligence',
      'term_sheet',
      'funded',
      'closed_lost',
    ])
    .optional(),
  firmType: z.enum(['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate']).optional(),
  page: z.coerce.number().int().positive().max(10_000).optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});

const CreateBody = z.object({
  firmId: z.string().uuid().optional(),
  firmName: z.string().min(1).max(160).optional(),
  firmType: z.enum(['vc', 'cvc', 'angel', 'family_office', 'accelerator', 'syndicate']).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  decisionAuthority: z.string().min(1).max(80),
  email: z.string().email().max(254),
  mobileE164: z
    .string()
    .regex(/^\+?\d{6,15}$/)
    .optional(),
  timezone: z.string().min(1).max(80),
  introPath: z.string().max(240).optional(),
  personalThesisNotes: z.string().max(2000).optional(),
});

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const url = new URL(req.url);
  const q = ListQuery.parse(Object.fromEntries(url.searchParams));
  const query: InvestorListQuery = {};
  if (q.search) query.search = q.search;
  if (q.stage) query.stage = q.stage;
  if (q.firmType) query.firmType = q.firmType;
  if (q.page) query.page = q.page;
  if (q.pageSize) query.pageSize = q.pageSize;
  const result = await listInvestors(user.workspaceId, query);
  return Response.json(result);
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:investors:create', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });
  const body = CreateBody.parse(await req.json());
  const investor = await createInvestor(user.workspaceId, user.id, body);
  return Response.json(investor, { status: 201 });
});
