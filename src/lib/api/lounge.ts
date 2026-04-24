export type LoungeDocumentKind = 'pitch_deck' | 'financial_model' | 'data_room' | 'other';

export type LoungeDocument = {
  id: string;
  kind: LoungeDocumentKind;
  filename: string;
  sizeBytes: number;
  viewUrl: string;
};

export type LoungeSlot = { startsAt: string; endsAt: string };

export type LoungeBundle = {
  investorName: string | null;
  documents: LoungeDocument[];
  suggestedSlots: LoungeSlot[];
  signedAt: string;
};

export async function fetchLoungeBundle(signal?: AbortSignal): Promise<LoungeBundle> {
  const init: RequestInit = { method: 'GET', credentials: 'include' };
  if (signal) init.signal = signal;
  const res = await fetch('/api/v1/lounge', init);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { title?: string } | null;
    throw new Error(data?.title ?? `${res.status}`);
  }
  return (await res.json()) as LoungeBundle;
}
