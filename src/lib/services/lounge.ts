import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';

import { ApiError } from '@/lib/api/handle';
import { readNdaSession } from '@/lib/auth/nda-session';
import { db } from '@/lib/db/client';
import { documentsRepo, type DocumentRow } from '@/lib/db/repos/documents';
import { investors, leads, meetings, users } from '@/lib/db/schema';
import { getStorage } from '@/lib/storage';
import { FOUNDER_TZ, generateBookableSlots } from '@/lib/time/availability';
import { DEFAULT_FOUNDER_TZ } from '@/lib/time/tz';

export type LoungeBundle = {
  investorName: string | null;
  investorFirstName: string | null;
  investorLastName: string | null;
  investorEmail: string;
  investorFirmName: string | null;
  investorTimezone: string;
  founderTimezone: string;
  documents: Array<{
    id: string;
    kind: DocumentRow['kind'];
    filename: string;
    sizeBytes: number;
    viewUrl: string;
    locked: boolean;
    minLeadStage: string | null;
  }>;
  suggestedSlots: Array<{ startsAt: string; endsAt: string }>;
  signedAt: string;
};

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

  const { firms } = await import('@/lib/db/schema');
  const leadJoin = await db
    .select({
      workspaceId: leads.workspaceId,
      investorTimezone: investors.timezone,
      investorFirstName: investors.firstName,
      investorLastName: investors.lastName,
      investorFirmName: firms.name,
    })
    .from(leads)
    .leftJoin(investors, eq(investors.id, leads.investorId))
    .leftJoin(firms, eq(firms.id, investors.firmId))
    .where(eq(leads.id, session.leadId))
    .limit(1);

  const workspaceId: string | null = leadJoin[0]?.workspaceId ?? null;
  const investorTimezone: string = leadJoin[0]?.investorTimezone ?? DEFAULT_FOUNDER_TZ;
  const investorFirstName: string | null = leadJoin[0]?.investorFirstName ?? null;
  const investorLastName: string | null = leadJoin[0]?.investorLastName ?? null;
  const investorFirmName: string | null = leadJoin[0]?.investorFirmName ?? null;

  if (!workspaceId) throw new ApiError(404, 'lead_not_found');

  const founderRow = await db
    .select({ tz: users.defaultTimezone })
    .from(users)
    .where(and(eq(users.workspaceId, workspaceId), eq(users.role, 'founder')))
    .limit(1);
  // Founder timezone is anchored to IST per the OotaOS scheduling policy.
  const founderTimezone: string = founderRow[0]?.tz ?? FOUNDER_TZ;

  const docs = await documentsRepo.list(workspaceId);

  // Resolve the investor's current lead stage so we can flag locked docs in
  // the UI (rule #10). The download endpoint enforces the gate again at
  // fetch time — this only changes presentation, not access control.
  const [leadStageRow] = await db
    .select({ stage: leads.stage })
    .from(leads)
    .where(eq(leads.id, session.leadId))
    .limit(1);
  const currentStage = leadStageRow?.stage ?? 'nda_signed';
  const { stageMeetsMinimum } = await import('@/lib/auth/investor-context');

  // Generate IST-windowed bookable slots (skips breakfast/lunch/dinner breaks
  // and weekends, with 20-hour minimum notice). Show 6 options.
  const taken = await takenMeetingStarts(workspaceId);
  const rawSlots = generateBookableSlots(30, 60);
  const suggestedSlots = rawSlots
    .filter((slot) => !taken.has(slot.startsAt))
    .slice(0, 6)
    .map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));

  const documents = await Promise.all(
    docs.map(async (d) => {
      type StageKey = Parameters<typeof stageMeetsMinimum>[0];
      const minStage = d.minLeadStage as StageKey | null;
      const locked = Boolean(minStage && !stageMeetsMinimum(currentStage as StageKey, minStage));
      return {
        id: d.id,
        kind: d.kind,
        filename: d.originalFilename,
        sizeBytes: d.sizeBytes,
        viewUrl: `/api/v1/document/${d.id}`,
        locked,
        minLeadStage: minStage ?? null,
      };
    }),
  );

  const investorName =
    [investorFirstName, investorLastName]
      .filter((s): s is string => Boolean(s))
      .join(' ')
      .trim() || session.email;
  return {
    investorName,
    investorFirstName,
    investorLastName,
    investorEmail: session.email,
    investorFirmName,
    investorTimezone,
    founderTimezone,
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

  const leadRow = await db.execute<{ workspace_id: string; deal_id: string; stage: string }>(
    await import('drizzle-orm').then(
      (m) =>
        m.sql`SELECT workspace_id, deal_id, stage::text FROM leads WHERE id = ${session.leadId} LIMIT 1`,
    ),
  );
  const workspaceId = leadRow[0]?.workspace_id;
  const dealId = leadRow[0]?.deal_id;
  const leadStage = leadRow[0]?.stage;
  if (!workspaceId || !dealId) throw new ApiError(404, 'lead_not_found');

  const doc = await documentsRepo.byId(workspaceId as string, documentId);
  if (!doc) throw new ApiError(404, 'document_not_found');

  // Rule #9: deal-scoped data room — investor on deal A cannot fetch deal B's docs.
  if (doc.dealId && doc.dealId !== dealId) throw new ApiError(404, 'document_not_found');

  // Rule #10: per-stage permissioning. minLeadStage NULL = visible after NDA.
  if (doc.minLeadStage) {
    const { stageMeetsMinimum } = await import('@/lib/auth/investor-context');
    type StageKey = Parameters<typeof stageMeetsMinimum>[0];
    if (!stageMeetsMinimum(leadStage as StageKey, doc.minLeadStage as StageKey)) {
      throw new ApiError(403, 'stage_too_early_for_document');
    }
  }

  const { watermarkPdf } = await import('@/lib/pdf/watermark');

  const raw = await getStorage().get(doc.r2Key);
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

  return getStorage().url(doc.r2Key, 900);
}
