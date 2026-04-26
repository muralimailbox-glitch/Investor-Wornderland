export type DocumentKind =
  | 'pitch_deck'
  | 'financial_model'
  | 'customer_refs'
  | 'tech_arch'
  | 'cap_table'
  | 'product_demo'
  | 'term_sheet'
  | 'other';

export type WatermarkPolicy = 'per_investor' | 'static' | 'none';

export type LeadStage =
  | 'prospect'
  | 'contacted'
  | 'engaged'
  | 'nda_pending'
  | 'nda_signed'
  | 'meeting_scheduled'
  | 'diligence'
  | 'term_sheet'
  | 'funded'
  | 'closed_lost';

export type DocumentRow = {
  id: string;
  workspaceId: string;
  kind: DocumentKind;
  title: string | null;
  r2Key: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  watermarkPolicy: WatermarkPolicy;
  minLeadStage: LeadStage | null;
  expiresAt: string | null;
  uploadedBy: string;
  deletedAt: string | null;
  createdAt: string;
};

export async function listDocuments(): Promise<DocumentRow[]> {
  const res = await fetch('/api/v1/admin/documents', { credentials: 'include' });
  if (!res.ok) throw new Error(`list_failed_${res.status}`);
  const data = (await res.json()) as { documents: DocumentRow[] };
  return data.documents;
}

export async function uploadDocument(input: {
  file: File;
  kind: DocumentKind;
  title?: string;
  watermarkPolicy?: WatermarkPolicy;
  expiresInDays?: number;
  minLeadStage?: LeadStage;
}): Promise<DocumentRow> {
  const form = new FormData();
  form.set('file', input.file);
  form.set('kind', input.kind);
  if (input.title) form.set('title', input.title);
  if (input.watermarkPolicy) form.set('watermarkPolicy', input.watermarkPolicy);
  if (input.expiresInDays !== undefined) form.set('expiresInDays', String(input.expiresInDays));
  if (input.minLeadStage) form.set('minLeadStage', input.minLeadStage);
  const res = await fetch('/api/v1/admin/documents', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { title?: string } | null;
    throw new Error(err?.title ?? `upload_failed_${res.status}`);
  }
  const data = (await res.json()) as { document: DocumentRow };
  return data.document;
}

export async function patchDocument(
  id: string,
  patch: {
    title?: string;
    kind?: DocumentKind;
    watermarkPolicy?: WatermarkPolicy;
    expiresInDays?: number | null;
  },
): Promise<DocumentRow> {
  const res = await fetch(`/api/v1/admin/documents/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patch_failed_${res.status}`);
  const data = (await res.json()) as { document: DocumentRow };
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/documents/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}
