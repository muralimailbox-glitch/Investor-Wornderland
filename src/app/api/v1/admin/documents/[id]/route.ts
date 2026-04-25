import { z } from 'zod';

import { BadRequestError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { documentsRepo } from '@/lib/db/repos/documents';
import { rateLimit } from '@/lib/security/rate-limit';
import { getStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  title: z.string().max(200).optional(),
  kind: z
    .enum([
      'pitch_deck',
      'financial_model',
      'customer_refs',
      'tech_arch',
      'cap_table',
      'product_demo',
      'term_sheet',
      'other',
    ])
    .optional(),
  watermarkPolicy: z.enum(['per_investor', 'static', 'none']).optional(),
  expiresInDays: z.number().int().positive().max(365).nullable().optional(),
});

const IdSchema = z.string().uuid();

function idFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return IdSchema.parse(segments[segments.length - 1]);
}

export const PATCH = handle(async (req) => {
  const id = idFromUrl(req.url);
  await rateLimit(req, { key: 'admin:documents:patch', perMinute: 30 });
  const { user } = await requireAuth({ role: 'founder' });

  const existing = await documentsRepo.byId(user.workspaceId, id);
  if (!existing) throw new NotFoundError('document_not_found');

  const patch = PatchBody.parse(await req.json());
  if (Object.keys(patch).length === 0) throw new BadRequestError('empty_patch');

  const update: Parameters<typeof documentsRepo.update>[2] = {};
  if (patch.title !== undefined) update.title = patch.title || null;
  if (patch.kind) update.kind = patch.kind;
  if (patch.watermarkPolicy) update.watermarkPolicy = patch.watermarkPolicy;
  if (patch.expiresInDays !== undefined) {
    (update as { expiresAt?: Date | null }).expiresAt =
      patch.expiresInDays === null
        ? null
        : new Date(Date.now() + patch.expiresInDays * 24 * 60 * 60 * 1000);
  }

  const row = await documentsRepo.update(user.workspaceId, id, update);
  if (!row) throw new NotFoundError('document_not_found');

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'document.updated',
    targetType: 'document',
    targetId: id,
    payload: patch,
  });

  return Response.json({ document: row });
});

export const DELETE = handle(async (req) => {
  const id = idFromUrl(req.url);
  await rateLimit(req, { key: 'admin:documents:delete', perMinute: 20 });
  const { user } = await requireAuth({ role: 'founder' });

  const existing = await documentsRepo.byId(user.workspaceId, id);
  if (!existing) throw new NotFoundError('document_not_found');

  await documentsRepo.softDelete(user.workspaceId, id);
  try {
    await getStorage().delete(existing.r2Key);
  } catch (err) {
    console.warn('[documents] storage delete failed — row already soft-deleted', err);
  }

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'document.deleted',
    targetType: 'document',
    targetId: id,
    payload: { filename: existing.originalFilename },
  });

  return Response.json({ ok: true });
});
