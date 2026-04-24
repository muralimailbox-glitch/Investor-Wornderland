export type Deal = {
  id: string;
  workspaceId: string;
  roundLabel: string;
  targetSizeUsd: number;
  preMoneyUsd: number | null;
  postMoneyUsd: number | null;
  committedUsd: number;
  seedFunded: boolean;
  companyType: string;
  incorporationCountry: string;
  pitchJurisdiction: string;
  createdAt: string;
  updatedAt: string;
};

export type DealCreate = {
  roundLabel: string;
  targetSizeUsd: number;
  preMoneyUsd?: number | null;
  postMoneyUsd?: number | null;
  committedUsd?: number;
  seedFunded?: boolean;
  companyType: string;
  incorporationCountry: string;
  pitchJurisdiction: string;
};

export type DealPatch = Partial<DealCreate>;

export async function getCurrentDeal(): Promise<Deal | null> {
  const res = await fetch('/api/v1/admin/deals/current', { credentials: 'include' });
  if (!res.ok) throw new Error(`deal_current_failed_${res.status}`);
  return (await res.json()) as Deal | null;
}

export async function listDeals(): Promise<{ rows: Deal[] }> {
  const res = await fetch('/api/v1/admin/deals', { credentials: 'include' });
  if (!res.ok) throw new Error(`deals_list_failed_${res.status}`);
  return (await res.json()) as { rows: Deal[] };
}

export async function createDeal(body: DealCreate): Promise<Deal> {
  const res = await fetch('/api/v1/admin/deals', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`deal_create_failed_${res.status}`);
  return (await res.json()) as Deal;
}

export async function patchDeal(id: string, body: DealPatch): Promise<Deal> {
  const res = await fetch(`/api/v1/admin/deals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`deal_patch_failed_${res.status}`);
  return (await res.json()) as Deal;
}
