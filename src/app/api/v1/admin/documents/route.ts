import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { BadRequestError, handle } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { dealsRepo } from '@/lib/db/repos/deals';
import { documentsRepo } from '@/lib/db/repos/documents';
import { rateLimit } from '@/lib/security/rate-limit';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_KINDS = [
  'pitch_deck',
  'financial_model',
  'customer_refs',
  'tech_arch',
  'cap_table',
  'product_demo',
  'term_sheet',
  'other',
] as const;
const ALLOWED_WATERMARK = ['per_investor', 'static', 'none'] as const;
const ALLOWED_STAGES = [
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
] as const;
const MAX_BYTES = 50 * 1024 * 1024;

const MetaBody = z.object({
  kind: z.enum(ALLOWED_KINDS),
  title: z.string().max(200).nullable(),
  watermarkPolicy: z.enum(ALLOWED_WATERMARK),
  expiresInDays: z.number().positive().max(365).nullable(),
  minLeadStage: z.enum(ALLOWED_STAGES).nullable(),
});

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
]);

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:documents:list', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const rows = await documentsRepo.list(user.workspaceId);
  return Response.json({ documents: rows });
});

export const POST = handle(async (req) => {
  await rateLimit(req, { key: 'admin:documents:upload', perMinute: 20 });
  const { user } = await requireAuth({ role: 'founder' });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new BadRequestError('file_required');
  if (file.size === 0) throw new BadRequestError('empty_file');
  if (file.size > MAX_BYTES) throw new BadRequestError('file_too_large');
  if (!ALLOWED_MIME.has(file.type || 'application/octet-stream')) {
    throw new BadRequestError('unsupported_mime');
  }

  const titleRaw = String(form.get('title') ?? '')
    .trim()
    .slice(0, 200);
  const expiresDaysRaw = String(form.get('expiresInDays') ?? '');
  const minLeadStageRaw = String(form.get('minLeadStage') ?? '').trim();
  const meta = MetaBody.parse({
    kind: String(form.get('kind') ?? 'other'),
    title: titleRaw.length > 0 ? titleRaw : null,
    watermarkPolicy: String(form.get('watermarkPolicy') ?? 'per_investor'),
    expiresInDays: expiresDaysRaw ? Number(expiresDaysRaw) : null,
    minLeadStage:
      minLeadStageRaw && ALLOWED_STAGES.includes(minLeadStageRaw as (typeof ALLOWED_STAGES)[number])
        ? (minLeadStageRaw as (typeof ALLOWED_STAGES)[number])
        : null,
  });
  const { kind, title, watermarkPolicy, minLeadStage } = meta;

  // Rule #8: watermark policy must be truthful. The watermark pipeline only
  // knows how to stamp PDFs — non-PDF files cannot honor per_investor or
  // static policies, so reject the upload here rather than silently
  // delivering bare bytes to investors.
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf && watermarkPolicy !== 'none') {
    throw new BadRequestError('watermark_requires_pdf');
  }
  const expiresAt =
    meta.expiresInDays != null
      ? new Date(Date.now() + meta.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  // Resolve the workspace's active deal so every new document is deal-scoped.
  // Without this the row's deal_id stayed null and the public fetch gate's
  // existing `if (doc.dealId && doc.dealId !== dealId)` would let the doc
  // leak across deals once the workspace ever adds a second deal.
  const activeDeals = await dealsRepo.activeForWorkspace(user.workspaceId);
  const activeDeal = activeDeals[0];
  if (!activeDeal) {
    throw new BadRequestError('no_active_deal');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const r2Key = `workspaces/${user.workspaceId}/documents/${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)}`;

  await getStorage().put(r2Key, Buffer.from(bytes), file.type || 'application/octet-stream');

  const row = await documentsRepo.create({
    workspaceId: user.workspaceId,
    dealId: activeDeal.id,
    kind,
    title,
    r2Key,
    originalFilename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    sha256,
    watermarkPolicy,
    minLeadStage,
    expiresAt,
    uploadedBy: user.id,
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'document.uploaded',
    targetType: 'document',
    targetId: row.id,
    payload: { kind, title, filename: file.name, sizeBytes: file.size, watermarkPolicy },
  });

  return Response.json({ document: row }, { status: 201 });
});
