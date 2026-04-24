export type FirmDraft = {
  name: string;
  firmType?: 'vc' | 'cvc' | 'angel' | 'family_office' | 'accelerator' | 'syndicate' | null;
  hqCity?: string | null;
  hqCountry?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  twitterHandle?: string | null;
  tracxnUrl?: string | null;
  foundedYear?: number | null;
  portfolioCount?: number | null;
  topSectorsInPortfolio?: string[] | null;
  topLocationsInPortfolio?: string[] | null;
  topEntryRounds?: string[] | null;
  dealsLast12Months?: number | null;
};

export type InvestorDraft = {
  firmName: string;
  firstName: string;
  lastName: string;
  title: string;
  decisionAuthority: 'full' | 'partial' | 'influencer' | 'none';
  email?: string | null;
  mobileE164?: string | null;
  linkedinUrl?: string | null;
  twitterHandle?: string | null;
  timezone?: string | null;
  city?: string | null;
  country?: string | null;
  photoUrl?: string | null;
  crunchbaseUrl?: string | null;
  tracxnUrl?: string | null;
  angellistUrl?: string | null;
  websiteUrl?: string | null;
  checkSizeMinUsd?: number | null;
  checkSizeMaxUsd?: number | null;
  sectorInterests?: string[] | null;
  stageInterests?: string[] | null;
  bioSummary?: string | null;
};

export type TracxnParseResult = {
  firms: FirmDraft[];
  investors: InvestorDraft[];
  unmatched: string[];
};

export type BulkRowStatus =
  | {
      kind: 'investor';
      email: string;
      status: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
    }
  | {
      kind: 'firm';
      name: string;
      status: 'created' | 'updated' | 'skipped';
      id?: string;
      reason?: string;
    };

export type BulkImportResult = {
  firmsCreated: number;
  firmsUpdated: number;
  investorsCreated: number;
  investorsUpdated: number;
  rows: BulkRowStatus[];
  dryRun: boolean;
};

export async function parseTracxn(raw: string): Promise<TracxnParseResult> {
  const res = await fetch('/api/v1/admin/tracxn/parse', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`tracxn_parse_failed_${res.status}`);
  return (await res.json()) as TracxnParseResult;
}

export async function bulkImportInvestors(input: {
  firms?: FirmDraft[];
  investors: InvestorDraft[];
  dryRun?: boolean;
  idempotencyKey?: string;
}): Promise<BulkImportResult> {
  const res = await fetch('/api/v1/admin/investors/bulk-import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`bulk_import_failed_${res.status}`);
  return (await res.json()) as BulkImportResult;
}
