import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { documentsRepo, type DocumentRow } from '@/lib/db/repos/documents';
import { meetings } from '@/lib/db/schema';
import { signedDownloadUrl } from '@/lib/storage/r2';

export type LoungeBundle = {
  investorName: string | null;
  documents: Array<{
    id: string;
    kind: DocumentRow['kind'];
    filename: string;
    sizeBytes: number;
    viewUrl: string;
  }>;
  suggestedSlots: Array<{ startsAt: string; endsAt: string }>;
  signedAt: string;
};

function suggestedSlotsFromNow(
  now = new Date(),
  count = 3,
): Array<{ startsAt: string; endsAt: string }> {
  const out: Array<{ startsAt: string; endsAt: string }> = [];
  const start = new Date(now);
  start.setUTCHours(Math.max(start.getUTCHours() + 24, 9), 30, 0, 0);

  for (let i = 0; i < count; i++) {
    const s = new Date(start);
    s.setUTCDate(s.getUTCDate() + i);
    const e = new Date(s);
    e.setUTCMinutes(s.getUTCMinutes() + 30);
    out.push({ startsAt: s.toISOString(), endsAt: e.toISOString() });
  }
  return out;
}

async function takenMeetingStarts(workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ startsAt: meetings.startsAt })
    .from(meetings)
    .where(eq(meetings.workspaceId, workspaceId));
  return new Set(rows.map((r) => r.startsAt.toISOString()));
}

export async function getLoungeBundle(): Promise<LoungeBundle> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('ootaos_nda')?.value;
  const session = readNdaSession(cookie);
  if (!session) throw new ApiError(401, 'nda_required');

  const leadRow = await db
    .select({ workspaceId: meetings.workspaceId })
    .from(meetings)
    .where(eq(meetings.leadId, session.leadId))
    .limit(1);

  let workspaceId: string | null = leadRow[0]?.workspaceId ?? null;

  if (!workspaceId) {
    const fallback = await db.execute<{ workspace_id: string }>(
      await import('drizzle-orm').then(
        (m) => m.sql`SELECT workspace_id FROM leads WHERE id = ${session.leadId} LIMIT 1`,
      ),
    );
    workspaceId = (fallback[0]?.workspace_id as string | undefined) ?? null;
  }

  if (!workspaceId) throw new ApiError(404, 'lead_not_found');

  const docs = await documentsRepo.list(workspaceId);

  const taken = await takenMeetingStarts(workspaceId);
  const rawSlots = suggestedSlotsFromNow();
  const suggestedSlots = rawSlots.filter((slot) => !taken.has(slot.startsAt));

  const documents = await Promise.all(
    docs.map(async (d) => ({
      id: d.id,
      kind: d.kind,
      filename: d.originalFilename,
      sizeBytes: d.sizeBytes,
      viewUrl: `/api/v1/document/${d.id}`,
    })),
  );

  return {
    investorName: session.email,
    documents,
    suggestedSlots,
    signedAt: new Date(session.issuedAt).toISOString(),
  };
}

export async function getDocumentForSession(documentId: string): Promise<{
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  signerEmail: string;
}> {
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const leadWorkspace = await db.execute<{ workspace_id: string }>(
    await import('drizzle-orm').then(
      (m) => m.sql`SELECT workspace_id FROM leads WHERE id = ${session.leadId} LIMIT 1`,
    ),
  );
  const workspaceId = leadWorkspace[0]?.workspace_id;
  if (!workspaceId) throw new ApiError(404, 'lead_not_found');

  const doc = await documentsRepo.byId(workspaceId as string, documentId);
  if (!doc) throw new ApiError(404, 'document_not_found');

  const { getObjectBytes } = await import('@/lib/storage/r2');
  const { watermarkPdf } = await import('@/lib/pdf/watermark');

  const raw = await getObjectBytes(doc.r2Key);
  const isPdf =
    doc.mimeType === 'application/pdf' || doc.originalFilename.toLowerCase().endsWith('.pdf');
  const bytes = isPdf
    ? await watermarkPdf(raw, {
        label: `Confidential — ${session.email} — ${new Date().toISOString().slice(0, 10)}`,
      })
    : raw;

  // Side-effect: record a document_viewed interaction.
  const { interactionsRepo } = await import('@/lib/db/repos/interactions');
  await interactionsRepo.record({
    workspaceId: workspaceId as string,
    leadId: session.leadId,
    kind: 'document_viewed',
    payload: { documentId: doc.id, filename: doc.originalFilename },
  });

  const voidFilename = /** @type {string} */ doc.originalFilename ?? 'document.pdf';
  return { bytes, filename: voidFilename, mimeType: doc.mimeType, signerEmail: session.email };
}

export async function signedUrlForDocument(documentId: string): Promise<string> {
  const cookieStore = await cookies();
  const session = readNdaSession(cookieStore.get('ootaos_nda')?.value);
  if (!session) throw new ApiError(401, 'nda_required');

  const leadWorkspace = await db.execute<{ workspace_id: string }>(
    await import('drizzle-orm').then(
      (m) => m.sql`SELECT workspace_id FROM leads WHERE id = ${session.leadId} LIMIT 1`,
    ),
  );
  const workspaceId = leadWorkspace[0]?.workspace_id;
  if (!workspaceId) throw new ApiError(404, 'lead_not_found');
  const doc = await documentsRepo.byId(workspaceId as string, documentId);
  if (!doc) throw new ApiError(404, 'document_not_found');

  return signedDownloadUrl(doc.r2Key, 900);
}
