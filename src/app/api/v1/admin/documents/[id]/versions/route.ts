import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { handle } from '@/lib/api/handle';
import { requireAuth } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { documentVersions } from '@/lib/db/schema';
import { rateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

function idFromUrl(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  // .../documents/:id/versions
  return IdSchema.parse(segments[segments.length - 2]);
}

export const GET = handle(async (req) => {
  await rateLimit(req, { key: 'admin:documents:versions', perMinute: 60 });
  const { user } = await requireAuth({ role: 'founder' });
  const documentId = idFromUrl(req.url);

  const rows = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.workspaceId, user.workspaceId),
        eq(documentVersions.documentId, documentId),
      ),
    )
    .orderBy(desc(documentVersions.version));

  return Response.json({
    versions: rows.map((r) => ({
      id: r.id,
      version: r.version,
      kind: r.kind,
      originalFilename: r.originalFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256: r.sha256,
      archivedAt: r.archivedAt.toISOString(),
    })),
  });
});
