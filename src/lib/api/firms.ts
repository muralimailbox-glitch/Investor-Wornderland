export type RecentDeal = {
  companyName: string;
  stage?: string | null;
  amountUsd?: number | null;
  date?: string | null;
  sector?: string | null;
};

export type KeyPerson = {
  name: string;
  title?: string | null;
  linkedinUrl?: string | null;
};

export type PercentMap = Record<string, number>;

export type Firm = {
  id: string;
  name: string;
  firmType: string;
  website: string | null;
  hqCity: string | null;
  hqCountry: string | null;
  aumUsd: number | null;
  activeFund: string | null;
  fundSizeUsd: number | null;
  stageFocus: string[] | null;
  sectorFocus: string[] | null;
  geographyFocus: string[] | null;
  chequeMinUsd: number | null;
  chequeMaxUsd: number | null;
  leadFollow: string | null;
  boardSeatPolicy: string | null;
  portfolioCount: number | null;
  notablePortfolio: string[] | null;
  competitorPortfolio: string[] | null;
  notableExits: string[] | null;
  decisionSpeed: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  twitterHandle: string | null;
  linkedinUrl: string | null;
  tracxnUrl: string | null;
  topSectorsInPortfolio: string[] | null;
  topLocationsInPortfolio: string[] | null;
  topEntryRounds: string[] | null;
  dealsLast12Months: number | null;
  tracxnScore: number | null;
  medianPortfolioTracxnScore: number | null;
  portfolioIpos: number | null;
  portfolioAcquisitions: number | null;
  portfolioUnicorns: number | null;
  portfolioSoonicorns: number | null;
  teamSizeTotal: number | null;
  fundClassification: string[] | null;
  operatingLocation: string | null;
  stageDistribution: PercentMap | null;
  sectorDistribution: PercentMap | null;
  locationDistribution: PercentMap | null;
  specialFlags: string[] | null;
  recentDeals: RecentDeal[] | null;
  keyPeople: KeyPerson[] | null;
  createdAt: string;
  updatedAt: string;
};

export type FirmPatch = Partial<Omit<Firm, 'id' | 'createdAt' | 'updatedAt'>>;

export async function getFirm(id: string): Promise<Firm> {
  const res = await fetch(`/api/v1/admin/firms/${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`firm_get_failed_${res.status}`);
  return (await res.json()) as Firm;
}

export async function patchFirm(id: string, body: FirmPatch): Promise<Firm> {
  const res = await fetch(`/api/v1/admin/firms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`firm_patch_failed_${res.status}`);
  return (await res.json()) as Firm;
}
