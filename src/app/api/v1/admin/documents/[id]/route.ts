import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { BadRequestError, handle, NotFoundError } from '@/lib/api/handle';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { documentsRepo } from '@/lib/db/repos/documents';
import { documentVersions } from '@/lib/db/schema';
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
  // Pipeline gating — null clears the gate (visible after NDA), any enum
  // value enforces the stage minimum at fetch time. Mirrors POST behaviour
  // so the founder can re-stage a document after upload without re-uploading.
  minLeadStage: z
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
    .nullable()
    .optional(),
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
  if (patch.minLeadStage !== undefined) {
    (update as { minLeadStage?: typeof patch.minLeadStage }).minLeadStage = patch.minLeadStage;
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

/**
 * Replace the file backing a document. Archives the previous bytes +
 * metadata into document_versions and updates the row in place. Investor-
 * facing routes always read the current row, so a replace is invisible
 * to the data room except via the new sha256.
 */
export const PUT = handle(async (req) => {
  const id = idFromUrl(req.url);
  await rateLimit(req, { key: 'admin:documents:replace', perMinute: 10 });
  const { user } = await requireAuth({ role: 'founder' });

  const existing = await documentsRepo.byId(user.workspaceId, id);
  if (!existing) throw new NotFoundError('document_not_found');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new BadRequestError('file_required');
  if (file.size === 0) throw new BadRequestError('empty_file');
  if (file.size > 50 * 1024 * 1024) throw new BadRequestError('file_too_large');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const newKey = `workspaces/${user.workspaceId}/documents/${randomUUID()}-${file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)}`;

  // Determine the next version number.
  const [latestVersion] = await db
    .select({ version: documentVersions.version })
    .from(documentVersions)
    .where(
      and(eq(documentVersions.workspaceId, user.workspaceId), eq(documentVersions.documentId, id)),
    )
    .orderBy(desc(documentVersions.version))
    .limit(1);
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // Upload new file to storage first — fail closed before we mutate the row.
  await getStorage().put(newKey, Buffer.from(bytes), file.type || existing.mimeType);

  // Archive the existing row.
  await db.insert(documentVersions).values({
    workspaceId: user.workspaceId,
    documentId: id,
    version: nextVersion,
    kind: existing.kind,
    originalFilename: existing.originalFilename,
    mimeType: existing.mimeType,
    sizeBytes: existing.sizeBytes,
    r2Key: existing.r2Key,
    sha256: existing.sha256,
    minLeadStage: existing.minLeadStage,
    dealId: existing.dealId,
    archivedBy: user.id,
  });

  // Update the live row to point at the new file.
  const updated = await documentsRepo.update(user.workspaceId, id, {
    r2Key: newKey,
    originalFilename: file.name,
    mimeType: file.type || existing.mimeType,
    sizeBytes: file.size,
    sha256,
  });

  await audit({
    workspaceId: user.workspaceId,
    actorUserId: user.id,
    action: 'document.replaced',
    targetType: 'document',
    targetId: id,
    payload: {
      filename: file.name,
      sha256,
      previousSha256: existing.sha256,
      previousVersion: nextVersion,
    },
  });

  return Response.json({ document: updated, archivedVersion: nextVersion });
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
